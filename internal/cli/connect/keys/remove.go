package keys

import (
	"encoding/base64"
	"encoding/json"
	"fmt"

	"github.com/spf13/cobra"
	"github.com/ygelfand/power-dash/internal/config"
	pw "github.com/ygelfand/power-dash/internal/powerwall"
	"github.com/ygelfand/power-dash/internal/utils"
)

func newKeysRemoveCmd(opts *config.PowerwallOptions) *cobra.Command {
	var (
		tokensFile string
		region     string
		siteID     int64
		keyPath    string
	)
	cmd := &cobra.Command{
		Use:   "remove <public-key>",
		Short: "remove an authorized RSA key from the Powerwall",
		Long: `Remove a registered key by its full public key (base64) shown in 'keys list'.

Sends a signed grpc_signed_command using your RSA private key (--key-path or
config key-path). The signing key must be VERIFIED on the device.

Example:
  power-dash connect keys list
  power-dash connect keys remove MIIBIjAN...`,
		Args: cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			pubKeyB64 := args[0]

			tokens, err := loadTokens(tokensFile, "", "")
			if err != nil {
				return err
			}
			client, siteID, din, err := resolveClient(tokens, tokensFile, region, siteID)
			if err != nil {
				return err
			}
			if din == "" {
				return fmt.Errorf("gateway DIN not found — re-run 'connect keys list' to detect it")
			}

			kp := utils.FirstNonEmpty(keyPath, opts.KeyPath, "tedapi_rsa_private.pem")
			privateKey, err := pw.LoadRSAPrivateKey(kp)
			if err != nil {
				return fmt.Errorf("load signing key %s: %w", kp, err)
			}

			pubKeyBytes, err := base64.StdEncoding.DecodeString(pubKeyB64)
			if err != nil {
				return fmt.Errorf("decode public key: %w", err)
			}

			signedBytes, err := pw.BuildRemoveKeyRequest(pubKeyBytes, privateKey, din)
			if err != nil {
				return fmt.Errorf("build signed command: %w", err)
			}

			preview := pubKeyB64
			if len(preview) > 40 {
				preview = preview[:40] + "..."
			}
			cmd.Printf("  Removing key (pubkey: %s) using %s...\n", preview, kp)

			resp, err := client.RemoveKey(tokens.AccessToken, siteID, base64.StdEncoding.EncodeToString(signedBytes))
			if err != nil {
				return fmt.Errorf("remove key: %w", err)
			}
			raw, _ := json.MarshalIndent(resp, "  ", "  ")
			cmd.Printf("  Response: %s\n", raw)
			cmd.Println("  Key removed.")
			return nil
		},
	}
	addTokenFlags(cmd, &tokensFile, &region, &siteID)
	cmd.Flags().StringVar(&keyPath, "key-path", "", "RSA private key to sign the request (defaults to config key-path)")
	return cmd
}

