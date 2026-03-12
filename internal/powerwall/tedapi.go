package powerwall

import (
	"bytes"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha512"
	"crypto/x509"
	"encoding/binary"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/ygelfand/power-dash/internal/config"
	"github.com/ygelfand/power-dash/internal/powerwall/queries"
	"go.uber.org/zap"
	"google.golang.org/protobuf/proto"
)

func (p *PowerwallGateway) GetConfig() *string {
	pm := &ParentMessage{
		Message: &MessageEnvelope{
			Payload: &MessageEnvelope_Filestore{
				Filestore: &FileStoreMessages{
					Message: &FileStoreMessages_ReadFileRequest{
						ReadFileRequest: &FileStoreAPIReadFileRequest{
							Domain: FileStoreAPIDomain_FILE_STORE_API_DOMAIN_CONFIG_JSON,
							Name:   "config.json",
						},
					},
				},
			},
			DeliveryChannel: 1,
			Sender: &Participant{
				Id: &Participant_Local{
					Local: 1,
				},
			},
			Recipient: &Participant{
				Id: &Participant_Din{
					Din: p.Din,
				},
			},
		},
		Tail: &Tail{
			Value: 1,
		},
	}
	reqbody, err := proto.Marshal(pm)
	_, resp, err := p.makeTedRequest(bytes.NewBuffer(reqbody))
	if err != nil {
		p.logger.Error("Failed to get config", zap.Error(err))
		return nil
	}
	pr := &ParentMessage{}
	if err = proto.Unmarshal(resp, pr); err != nil {
		p.logger.Error("Failed to unmarshal config response", zap.Error(err))
		return nil
	}
	fs := pr.Message.GetFilestore()
	if fs == nil {
		return nil
	}
	rr := fs.GetReadFileResponse()
	if rr == nil || rr.File == nil {
		return nil
	}
	res := string(rr.File.GetBlob())
	return &res
}

func (p *PowerwallGateway) RunQuery(query string, params *string) *string {
	var reqbody string
	queryObj := queries.GetQuery(query)
	if queryObj == nil {
		p.logger.Info("Query not found", zap.String("query", query))
		return nil
	}
	if params == nil || *params == "" {
		if queryObj.DefaultParams != nil {
			reqbody = *queryObj.DefaultParams
		} else {
			reqbody = "{}"
		}
	} else {
		reqbody = *params
	}
	pm := &ParentMessage{
		Message: &MessageEnvelope{
			DeliveryChannel: 1,
			Sender: &Participant{
				Id: &Participant_Local{
					Local: 1,
				},
			},
			Recipient: &Participant{
				Id: &Participant_Din{
					Din: p.Din,
				},
			},
			Payload: &MessageEnvelope_Graphql{
				Graphql: &GraphQLMessages{
					Send: &PayloadQuerySend{
						RequestFormat: Format_Json,
						Signature:     queries.GetQuery(query).Sig(),
						Payload: &PayloadString{
							Value: queries.GetQuery(query).Key(),
							Text:  queries.GetQuery(query).GetQuery(),
						},
						Body: &StringValue{
							Value: reqbody,
						},
					},
				},
			},
		},
		Tail: &Tail{
			Value: 1,
		},
	}

	body, err := proto.Marshal(pm)
	if err != nil {
		p.logger.Error("Failed to marshal query message", zap.Error(err))
		return nil
	}
	_, resp, err := p.makeTedRequest(bytes.NewBuffer(body))
	if err != nil {
		p.logger.Error("Failed to run query", zap.Error(err), zap.String("query", query))
		return nil
	}

	pr := &ParentMessage{}
	err = proto.Unmarshal(resp, pr)
	if err != nil {
		p.logger.Error("Failed to unmarshal query response", zap.Error(err), zap.String("response", string(resp)))
		return nil
	}
	if pr.Message == nil || pr.Message.Payload == nil {
		p.logger.Info("Query response payload is empty", zap.String("query", query))
		return nil
	}
	return &pr.Message.GetGraphql().Recv.Text
}

// CheckResult holds the outcome of a single connectivity probe.
type CheckResult struct {
	Name    string
	OK      bool
	Message string
}

// ConnectivityCheck runs a series of probes for the given connection mode and
// returns one CheckResult per check. Checks run in order; later checks are
// skipped when earlier ones fail.
func (p *PowerwallGateway) ConnectivityCheck(mode config.ConnectionMode) []CheckResult {
	prev := p.connectionMode
	p.connectionMode = mode
	defer func() { p.connectionMode = prev }()

	var results []CheckResult
	skip := func(names ...string) {
		for _, n := range names {
			results = append(results, CheckResult{Name: n, OK: false, Message: "skipped"})
		}
	}

	// 1. Network — DIN fetch is mode-agnostic; failure means unreachable.
	if p.getDin() == nil {
		results = append(results, CheckResult{Name: "network", OK: false, Message: "unreachable"})
		skip("auth", "config")
		return results
	}
	results = append(results, CheckResult{Name: "network", OK: true})

	// 2. Auth — POST a minimal envelope; HTTP 401/403 = bad credentials or bad key.
	minPM := &ParentMessage{
		Message: &MessageEnvelope{
			DeliveryChannel: DeliveryChannel_DELIVERY_CHANNEL_LOCAL_HTTPS,
			Sender:          &Participant{Id: &Participant_Local{Local: 1}},
			Recipient:       &Participant{Id: &Participant_Din{Din: p.Din}},
		},
		Tail: &Tail{Value: 1},
	}
	pmBytes, _ := proto.Marshal(minPM)
	status, _, authErr := p.makeTedRequest(bytes.NewBuffer(pmBytes))
	switch {
	case authErr != nil:
		results = append(results, CheckResult{Name: "auth", OK: false, Message: authErr.Error()})
		skip("config")
		return results
	case status == http.StatusUnauthorized || status == http.StatusForbidden:
		results = append(results, CheckResult{Name: "auth", OK: false, Message: fmt.Sprintf("HTTP %d", status)})
		skip("config")
		return results
	default:
		results = append(results, CheckResult{Name: "auth", OK: true, Message: fmt.Sprintf("HTTP %d", status)})
	}

	// 3. Config pull — exercises the full protobuf request/response pipeline.
	cfg := p.GetConfig()
	if cfg == nil || *cfg == "" {
		results = append(results, CheckResult{Name: "config", OK: false, Message: "no config returned"})
	} else {
		results = append(results, CheckResult{Name: "config", OK: true, Message: fmt.Sprintf("%d bytes", len(*cfg))})
	}

	return results
}

func (p *PowerwallGateway) getDin() *string {
	req, err := http.NewRequest("GET", p.Endpoint.JoinPath("tedapi", "din").String(), nil)
	if err != nil {
		p.logger.Error("Failed to get DIN", zap.Error(err))
		return nil
	}
	req.SetBasicAuth("Tesla_Energy_Device", p.password)
	resp, err := p.httpClient.Do(req)
	if err != nil {
		p.logger.Error("Failed to get DIN", zap.Error(err))
		return nil
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	res := strings.TrimSpace(string(body))
	p.logger.Debug("DIN", zap.String("din", res))
	return &res
}

func (p *PowerwallGateway) makeTedRequest(body io.Reader) (int, []byte, error) {
	var reqBody io.Reader = body
	path := "v1"
	if p.connectionMode == config.ConnectionModeLan {
		path = "v1r"
		wrapped, err := p.signRequest(body)
		if err != nil {
			return 0, nil, fmt.Errorf("failed to build v1r signed request: %w", err)
		}
		reqBody = wrapped
	}

	req, err := http.NewRequest("POST", p.Endpoint.JoinPath("tedapi", path).String(), reqBody)
	if err != nil {
		return 0, nil, err
	}
	req.Header.Set("Content-type", "application/octet-stream")
	if p.connectionMode != config.ConnectionModeLan {
		req.SetBasicAuth("Tesla_Energy_Device", p.password)
	}
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return 0, nil, err
	}
	defer resp.Body.Close()
	respbody, err := io.ReadAll(resp.Body)
	if err != nil {
		return resp.StatusCode, nil, err
	}

	p.logger.Debug("tedapi response",
		zap.String("path", req.URL.Path),
		zap.Int("status", resp.StatusCode),
		zap.Int("body_bytes", len(respbody)),
	)

	if p.connectionMode == config.ConnectionModeLan {
		parsed, err := parseSignedResponse(resp.StatusCode, respbody)
		if err != nil {
			return resp.StatusCode, nil, err
		}
		return resp.StatusCode, parsed, nil
	}

	return resp.StatusCode, respbody, nil
}

func parseSignedResponse(statusCode int, body []byte) ([]byte, error) {
	if statusCode != http.StatusOK {
		msg := strings.TrimSpace(string(body))
		if len(msg) == 0 || len(msg) > 200 {
			msg = fmt.Sprintf("HTTP %d", statusCode)
		}
		return nil, fmt.Errorf("tedapi: %s", msg)
	}
	sm := &SignedMessage{}
	if err := proto.Unmarshal(body, sm); err != nil {
		return nil, fmt.Errorf("unmarshal SignedMessage: %w", err)
	}
	if fault := sm.GetSignedMessageStatus().GetSignedMessageFault(); fault != MessageFault_E_MESSAGEFAULT_ERROR_NONE {
		return nil, fmt.Errorf("tedapi: %s", fault)
	}
	if len(sm.ProtobufMessageAsBytes) == 0 {
		return nil, nil
	}
	envelope := &MessageEnvelope{}
	if err := proto.Unmarshal(sm.ProtobufMessageAsBytes, envelope); err != nil {
		return nil, fmt.Errorf("unmarshal MessageEnvelope: %w", err)
	}
	inner, err := proto.Marshal(&ParentMessage{Message: envelope})
	if err != nil {
		return nil, fmt.Errorf("marshal ParentMessage: %w", err)
	}
	return inner, nil
}

func (p *PowerwallGateway) signRequest(body io.Reader) (io.Reader, error) {
	var pmBytes []byte
	if body != nil {
		var err error
		pmBytes, err = io.ReadAll(body)
		if err != nil {
			return nil, err
		}
	}

	pm := &ParentMessage{}
	if len(pmBytes) > 0 {
		if err := proto.Unmarshal(pmBytes, pm); err != nil {
			return nil, fmt.Errorf("unmarshal ParentMessage: %w", err)
		}
	}

	if pm.Message != nil {
		pm.Message.DeliveryChannel = DeliveryChannel_DELIVERY_CHANNEL_HERMES_COMMAND
		pm.Message.Sender = &Participant{
			Id: &Participant_AuthorizedClient{AuthorizedClient: 1},
		}
	}

	var envelopeBytes []byte
	if pm.Message != nil {
		var envErr error
		envelopeBytes, envErr = proto.Marshal(pm.Message)
		if envErr != nil {
			return nil, fmt.Errorf("marshal MessageEnvelope: %w", envErr)
		}
	}

	if p.privateKey != nil {
		out, err := buildSignedMessage(envelopeBytes, p.privateKey, p.Din)
		if err != nil {
			return nil, err
		}
		return bytes.NewBuffer(out), nil
	}

	sig := &SignedMessage{
		ToDestination: &Destination{
			SubDestination: &Destination_Domain{
				Domain: Domain_DOMAIN_ENERGY_DEVICE,
			},
		},
		ProtobufMessageAsBytes: envelopeBytes,
		Uuid:                   []byte(uuid.New().String()),
	}
	out, err := proto.Marshal(sig)
	if err != nil {
		return nil, fmt.Errorf("marshal SignedMessage: %w", err)
	}
	return bytes.NewBuffer(out), nil
}

// BuildSignedEnvelope serializes a MessageEnvelope, signs it with the given RSA
// key and DIN, and returns the serialized SignedMessage bytes.
func BuildSignedEnvelope(envelope *MessageEnvelope, privateKey *rsa.PrivateKey, din string) ([]byte, error) {
	envelopeBytes, err := proto.Marshal(envelope)
	if err != nil {
		return nil, fmt.Errorf("marshal envelope: %w", err)
	}
	return buildSignedMessage(envelopeBytes, privateKey, din)
}

// BuildRemoveKeyRequest builds a signed request to remove an authorized client key.
func BuildRemoveKeyRequest(pubKeyBytes []byte, privateKey *rsa.PrivateKey, din string) ([]byte, error) {
	envelope := &MessageEnvelope{
		DeliveryChannel: DeliveryChannel_DELIVERY_CHANNEL_HERMES_COMMAND,
		Sender:          &Participant{Id: &Participant_AuthorizedClient{AuthorizedClient: 1}},
		Recipient:       &Participant{Id: &Participant_Din{Din: din}},
		Payload: &MessageEnvelope_Authorization{
			Authorization: &AuthorizationMessages{
				Message: &AuthorizationMessages_RemoveAuthorizedClientRequest{
					RemoveAuthorizedClientRequest: &AuthorizationAPIRemoveAuthorizedClientRequest{
						PublicKey: pubKeyBytes,
					},
				},
			},
		},
	}
	return BuildSignedEnvelope(envelope, privateKey, din)
}

func buildSignedMessage(envelopeBytes []byte, privateKey *rsa.PrivateKey, din string) ([]byte, error) {
	expiresAt := uint32(time.Now().Unix()) + 12
	tlv := buildSigningTLV(din, expiresAt, envelopeBytes)
	h := sha512.New()
	h.Write(tlv)
	sigBytes, err := rsa.SignPKCS1v15(rand.Reader, privateKey, crypto.SHA512, h.Sum(nil))
	if err != nil {
		return nil, fmt.Errorf("RSA sign: %w", err)
	}
	pubDER := x509.MarshalPKCS1PublicKey(&privateKey.PublicKey)
	sm := &SignedMessage{
		ToDestination: &Destination{
			SubDestination: &Destination_Domain{Domain: Domain_DOMAIN_ENERGY_DEVICE},
		},
		ProtobufMessageAsBytes: envelopeBytes,
		Uuid:                   []byte(uuid.New().String()),
		SignatureData: &SignatureData{
			SignerIdentity: &KeyIdentity{
				IdentityType: &KeyIdentity_PublicKey{PublicKey: pubDER},
			},
			SigType: &SignatureData_RsaData{
				RsaData: &RsaSignatureData{
					ExpiresAt: expiresAt,
					Signature: sigBytes,
				},
			},
		},
	}
	return proto.Marshal(sm)
}

func buildSigningTLV(din string, expiresAt uint32, innerBytes []byte) []byte {
	tlv := func(tag byte, val []byte) []byte {
		return append([]byte{tag, byte(len(val))}, val...)
	}
	exp := make([]byte, 4)
	binary.BigEndian.PutUint32(exp, expiresAt)

	var buf []byte
	buf = append(buf, tlv(0, []byte{byte(SignatureType_SIGNATURE_TYPE_RSA)})...)
	buf = append(buf, tlv(1, []byte{byte(Domain_DOMAIN_ENERGY_DEVICE)})...)
	buf = append(buf, tlv(2, []byte(din))...)
	buf = append(buf, tlv(4, exp)...)
	buf = append(buf, 0xFF)
	buf = append(buf, innerBytes...)
	return buf
}
