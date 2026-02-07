// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Script, console } from "forge-std/Script.sol";
import { IExecCallbackReceiver } from "../src/IExecCallbackReceiver.sol";

contract DeployCallbackReceiverScript is Script {
    // Deployed iPred contracts on Arbitrum Sepolia
    address constant STATE_ANCHOR = 0x074Af457Ea1C58752705ce157f6892E5bBFc5988;
    address constant PRIVATE_TOKEN = 0x7402C579e7A661b3fdA0553E511D14Bf0aadcab9;

    function run() external {
        vm.startBroadcast();

        // iExec PoCo hub address on Arbitrum Sepolia
        // Override with IEXEC_HUB env var if different
        address iexecHub = vm.envOr("IEXEC_HUB", address(0));
        require(iexecHub != address(0), "Set IEXEC_HUB env var to the PoCo hub address");

        console.log("Deploying IExecCallbackReceiver...");
        console.log("StateAnchor:", STATE_ANCHOR);
        console.log("PrivateToken:", PRIVATE_TOKEN);
        console.log("iExec Hub:", iexecHub);

        IExecCallbackReceiver receiver = new IExecCallbackReceiver(
            STATE_ANCHOR,
            PRIVATE_TOKEN,
            iexecHub
        );

        console.log("IExecCallbackReceiver deployed at:", address(receiver));

        vm.stopBroadcast();

        console.log("\n=== Next Steps ===");
        console.log("1. Set CallbackReceiver as teeAddress on StateAnchor:");
        console.log("   StateAnchor.setTEEAddress(", address(receiver), ")");
        console.log("2. Set CallbackReceiver as teeAddress on PrivateToken:");
        console.log("   PrivateToken.setTEEAddress(", address(receiver), ")");
        console.log("3. Run iApp with --callback flag pointing to:", address(receiver));
    }
}
