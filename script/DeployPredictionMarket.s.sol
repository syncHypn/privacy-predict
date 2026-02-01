// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { PredictionMarket } from "../src/PredictionMarket.sol";

/// @title DeployPredictionMarket
/// @notice Deployment script for PredictionMarket AMM contract
/// @dev Requires MarketFactory and ConfidentialUSDC to be deployed first
contract DeployPredictionMarket is Script {
    // Deployed contracts on Arbitrum Sepolia
    address constant MARKET_FACTORY = 0x2a5C3684a8dEe90D04F89212cb419b9742470d9B;

    // TEE configuration
    address constant DEFAULT_TEE = 0x8Cdd26B54c3905BC86fEE5D2fBD7B1eeCd2B912B;
    bytes constant DEFAULT_TEE_PUBLIC_KEY = hex"2ce7ebbf286531909ee2f4fc403b2fe44c30962f321709fd1b90d144ae58b351";

    function run() external {
        // Load configuration from environment
        address marketFactory = vm.envOr("MARKET_FACTORY_ADDRESS", MARKET_FACTORY);
        address cUSDC = vm.envAddress("CONFIDENTIAL_USDC_ADDRESS"); // Required
        address teeAddress = vm.envOr("TEE_ADDRESS", DEFAULT_TEE);
        bytes memory teePublicKey = vm.envOr("TEE_PUBLIC_KEY", DEFAULT_TEE_PUBLIC_KEY);

        vm.startBroadcast();

        console.log("Deploying PredictionMarket...");
        console.log("MarketFactory:", marketFactory);
        console.log("ConfidentialUSDC:", cUSDC);
        console.log("TEE Address:", teeAddress);

        // Deploy PredictionMarket
        PredictionMarket predictionMarket = new PredictionMarket(
            marketFactory,
            cUSDC,
            teeAddress,
            teePublicKey
        );

        console.log("");
        console.log("=== Deployment Complete ===");
        console.log("PredictionMarket deployed at:", address(predictionMarket));

        vm.stopBroadcast();

        console.log("");
        console.log("=== Next Steps ===");
        console.log("1. Update TEE .env with PREDICTION_MARKET_ADDRESS");
        console.log("2. Deploy ConfidentialOutcomeTokens for each market");
        console.log("3. Initialize AMM pools via TEE");
        console.log("4. Verify contract on Arbiscan:");
        console.log("");
        console.log("forge verify-contract", address(predictionMarket));
        console.log("  src/PredictionMarket.sol:PredictionMarket");
    }
}
