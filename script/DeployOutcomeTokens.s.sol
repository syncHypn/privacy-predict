// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { ConfidentialOutcomeToken } from "../src/ConfidentialERC20.sol";

/// @title DeployOutcomeTokens
/// @notice Deployment script for ConfidentialOutcomeTokens (cYES/cNO) for a market
/// @dev Requires PredictionMarket to be deployed first
contract DeployOutcomeTokens is Script {
    // TEE address for balance updates
    address constant DEFAULT_TEE = 0x8Cdd26B54c3905BC86fEE5D2fBD7B1eeCd2B912B;


    /// @notice Deploy tokens using market ID from environment
    function run() external {
        bytes32 marketId = vm.envBytes32("MARKET_ID");
        _deploy(marketId);
    }

    /// @notice Internal deployment function
    function _deploy(bytes32 marketId) internal {
        // Load configuration from environment
        address predictionMarket = vm.envAddress("PREDICTION_MARKET_ADDRESS"); // Required
        address teeAddress = vm.envOr("TEE_ADDRESS", DEFAULT_TEE);

        vm.startBroadcast();

        console.log("Deploying ConfidentialOutcomeTokens...");
        console.log("Market ID:", vm.toString(marketId));
        console.log("PredictionMarket:", predictionMarket);
        console.log("TEE Address:", teeAddress);

        // Deploy cYES token
        ConfidentialOutcomeToken cYES = new ConfidentialOutcomeToken(
            marketId,
            true, // isYes = true
            predictionMarket,
            teeAddress
        );
        console.log("");
        console.log("cYES deployed at:", address(cYES));

        // Deploy cNO token
        ConfidentialOutcomeToken cNO = new ConfidentialOutcomeToken(
            marketId,
            false, // isYes = false
            predictionMarket,
            teeAddress
        );
        console.log("cNO deployed at:", address(cNO));

        vm.stopBroadcast();

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("Market ID:", vm.toString(marketId));
        console.log("cYES Token:", address(cYES));
        console.log("cNO Token:", address(cNO));

        console.log("");
        console.log("=== Next Steps ===");
        console.log("1. Register token addresses with TEE");
        console.log("2. Initialize AMM pool via TEE:");
        console.log("   cast send $PREDICTION_MARKET 'initializePool(bytes32,uint256)' \\");
        console.log("     ", vm.toString(marketId), " 1000000000 --private-key $TEE_KEY");
        console.log("");
        console.log("3. Verify contracts on Arbiscan:");
        console.log("");
        console.log("forge verify-contract", address(cYES));
        console.log("  src/ConfidentialERC20.sol:ConfidentialOutcomeToken");
        console.log("");
        console.log("forge verify-contract", address(cNO));
        console.log("  src/ConfidentialERC20.sol:ConfidentialOutcomeToken");
    }
}
