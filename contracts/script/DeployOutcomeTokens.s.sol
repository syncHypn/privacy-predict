// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { ConfidentialOutcomeToken } from "../src/ConfidentialERC20.sol";

/// @title DeployOutcomeTokens
/// @notice Deployment script for ConfidentialOutcomeTokens (cYES/cNO) for a market
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
        address teeAddress = vm.envOr("TEE_ADDRESS", DEFAULT_TEE);

        vm.startBroadcast();

        console.log("Deploying ConfidentialOutcomeTokens...");
        console.log("Market ID:", vm.toString(marketId));
        console.log("TEE Address:", teeAddress);

        // Deploy cYES token
        ConfidentialOutcomeToken cYES = new ConfidentialOutcomeToken(
            marketId,
            true, // isYes = true
            teeAddress
        );
        console.log("");
        console.log("cYES deployed at:", address(cYES));

        // Deploy cNO token
        ConfidentialOutcomeToken cNO = new ConfidentialOutcomeToken(
            marketId,
            false, // isYes = false
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
        console.log("2. Verify contracts on Arbiscan:");
        console.log("");
        console.log("forge verify-contract", address(cYES));
        console.log("  src/ConfidentialERC20.sol:ConfidentialOutcomeToken");
        console.log("");
        console.log("forge verify-contract", address(cNO));
        console.log("  src/ConfidentialERC20.sol:ConfidentialOutcomeToken");
    }
}
