package keys

import (
	"fmt"
	"time"

	"github.com/pterm/pterm"
	"github.com/spf13/cobra"
	"github.com/ygelfand/power-dash/internal/fleet"
	"github.com/ygelfand/power-dash/internal/utils"
)

func keyStateName(state int) string {
	switch state {
	case fleet.KeyStatePending:
		return "PENDING"
	case fleet.KeyStatePendingVerification:
		return "PENDING_VERIFICATION"
	case fleet.KeyStateVerified:
		return "VERIFIED"
	default:
		return fmt.Sprintf("UNKNOWN(%d)", state)
	}
}

// loadTokens loads tokens and auto-refreshes if expired.
// clientID/clientSecret supplement stored credentials for refresh.
func loadTokens(tokensFile, clientID, clientSecret string) (*fleet.Tokens, error) {
	tokens, err := fleet.LoadTokens(tokensFile)
	if err != nil {
		return nil, fmt.Errorf("load tokens: %w", err)
	}
	if tokens == nil {
		return nil, fmt.Errorf("no tokens at %s — run: power-dash connect auth", tokensFile)
	}
	if !tokens.IsExpired() {
		return tokens, nil
	}
	pterm.Info.Println("Access token expired — refreshing...")
	tokens.ClientID = utils.FirstNonEmpty(tokens.ClientID, clientID)
	tokens.ClientSecret = utils.FirstNonEmpty(tokens.ClientSecret, clientSecret)
	refreshed, rErr := fleet.RefreshTokens(tokens)
	if rErr != nil {
		return nil, fmt.Errorf("token refresh failed: %w\n  Run: power-dash connect auth", rErr)
	}
	if sErr := fleet.SaveTokens(tokensFile, refreshed); sErr != nil {
		pterm.Warning.Printfln("could not save refreshed tokens: %v", sErr)
	} else {
		pterm.Success.Println("Token refreshed.")
	}
	return refreshed, nil
}

// resolveClient finds the Fleet API client, energy site ID, and gateway DIN.
// When the region/site/DIN are auto-detected they are saved back into tokensFile
// so future calls skip detection.
func resolveClient(tokens *fleet.Tokens, tokensFile, region string, siteID int64) (*fleet.Client, int64, string, error) {
	accessToken := tokens.AccessToken

	// Use stored region if not overridden by flag.
	if region == "" {
		region = tokens.Region
	}

	// Use stored site/DIN if not overridden.
	if siteID == 0 {
		siteID = tokens.EnergySiteID
	}
	din := tokens.GatewayDIN

	if region != "" {
		base, ok := fleet.FleetRegions[region]
		if !ok {
			return nil, 0, "", fmt.Errorf("unknown region %q", region)
		}
		c := fleet.NewClient("", "", "", base)
		if siteID == 0 || din == "" {
			sites, err := c.GetEnergySites(accessToken)
			if err != nil {
				return nil, 0, "", fmt.Errorf("get sites: %w", err)
			}
			if len(sites) == 1 {
				siteID = sites[0].EnergySiteID
				din = sites[0].GatewayDIN
				persistSiteInfo(tokensFile, tokens, "", siteID, din)
			}
		}
		return c, siteID, din, nil
	}

	spinner, _ := pterm.DefaultSpinner.Start("Detecting region and site...")
	for name, base := range map[string]string{"na": fleet.FleetRegions["na"], "eu": fleet.FleetRegions["eu"]} {
		c := fleet.NewClient("", "", "", base)
		sites, err := c.GetEnergySites(accessToken)
		if err != nil {
			continue
		}
		if len(sites) == 0 {
			continue
		}
		if siteID == 0 {
			if len(sites) == 1 {
				siteID = sites[0].EnergySiteID
				din = sites[0].GatewayDIN
				spinner.Success(fmt.Sprintf("Region: %s  Site: %s (ID: %d  DIN: %s)", name, sites[0].SiteName, sites[0].EnergySiteID, sites[0].GatewayDIN))
			} else {
				spinner.Fail("Multiple sites found")
				for i, s := range sites {
					pterm.Printfln("  [%d] %s  (ID: %d  DIN: %s)", i, s.SiteName, s.EnergySiteID, s.GatewayDIN)
				}
				return nil, 0, "", fmt.Errorf("multiple sites found — use --site-id")
			}
		}
		persistSiteInfo(tokensFile, tokens, name, siteID, din)
		return c, siteID, din, nil
	}
	spinner.Fail("No energy sites found")
	return nil, 0, "", fmt.Errorf("no energy sites found — run: power-dash connect auth")
}

// persistSiteInfo saves region, site ID, and DIN into the tokens file.
func persistSiteInfo(tokensFile string, tokens *fleet.Tokens, region string, siteID int64, din string) {
	if region != "" {
		tokens.Region = region
	}
	tokens.EnergySiteID = siteID
	tokens.GatewayDIN = din
	if err := fleet.SaveTokens(tokensFile, tokens); err != nil {
		pterm.Warning.Printfln("could not persist site info: %v", err)
	}
}

func pollKeyState(client *fleet.Client, token string, siteID int64, pubKey string, attempts int, delay time.Duration) int {
	spinner, _ := pterm.DefaultSpinner.Start("Polling key state...")
	var state int
	for i := range attempts {
		if i > 0 {
			time.Sleep(delay)
		}
		var err error
		if pubKey != "" {
			state, err = client.GetClientStateByKey(token, siteID, pubKey)
		} else {
			state, err = client.ListAuthorizedClients(token, siteID)
		}
		spinner.UpdateText(fmt.Sprintf("Poll %d/%d: %s", i+1, attempts, keyStateName(state)))
		if err != nil {
			pterm.Warning.Println(err)
		}
		if state == fleet.KeyStateVerified {
			spinner.Success("Key verified")
			return state
		}
	}
	spinner.Fail(fmt.Sprintf("Key not verified after %d polls", attempts))
	return state
}

func addTokenFlags(cmd *cobra.Command, tokensFile *string, region *string, siteID *int64) {
	cmd.Flags().StringVar(tokensFile, "tokens-file", "fleet_tokens.json", "path to OAuth tokens file")
	cmd.Flags().StringVar(region, "region", "", "Fleet API region: na, eu (auto-detected)")
	cmd.Flags().Int64Var(siteID, "site-id", 0, "energy site ID (auto-detected)")
}

func showKeys(client *fleet.Client, accessToken string, siteID int64) (state int, pendingPubKey string, err error) {
	clients, err := client.ListClients(accessToken, siteID)
	if err != nil {
		return 0, "", fmt.Errorf("list keys: %w", err)
	}
	if len(clients) == 0 {
		pterm.Info.Println("No authorized clients registered.")
		return 0, "", nil
	}

	tableData := pterm.TableData{{"STATE", "DESCRIPTION", "PUBLIC KEY (base64)"}}
	firstState, firstPubKey, pendingState, pendingKey := 0, "", 0, ""
	for i, cl := range clients {
		if i == 0 {
			firstState = cl.State
			firstPubKey = cl.PublicKey
		}
		if cl.State == fleet.KeyStatePendingVerification && pendingKey == "" {
			pendingState = cl.State
			pendingKey = cl.PublicKey
		}
		tableData = append(tableData, []string{keyStateName(cl.State), cl.Description, cl.PublicKey})
	}
	pterm.DefaultTable.WithHasHeader().WithData(tableData).Render()
	pterm.Println()
	pterm.Info.Println("Use the full PUBLIC KEY with 'keys remove <public-key>'.")

	if pendingKey != "" {
		return pendingState, pendingKey, nil
	}
	return firstState, firstPubKey, nil
}
