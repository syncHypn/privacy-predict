// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Pausable } from "@openzeppelin/contracts/utils/Pausable.sol";
import { IStateAnchor } from "./interfaces/IStateAnchor.sol";
import { IPrivateToken } from "./interfaces/IPrivateToken.sol";

/// @title IExecCallbackReceiver
/// @notice Receives iExec TEE task results and forwards state updates to iPred contracts
/// @dev Implements ERC1154 receiveResult for iExec protocol callbacks.
///      After a TEE task completes, the iExec PoCo hub calls receiveResult() with
///      ABI-encoded callback data containing state root, prices, and encrypted balances.
///      Everything is processed in a single transaction (must fit in 200k gas).
contract IExecCallbackReceiver is Ownable, Pausable {
    IStateAnchor public stateAnchor;
    IPrivateToken public privateToken;

    /// @notice The iExec PoCo hub address authorized to call receiveResult
    address public iexecHub;

    /// @notice Track processed task IDs to prevent replay
    mapping(bytes32 => bool) public processedTasks;

    /// @notice Store the state root from each callback for balance update verification
    mapping(bytes32 => bytes32) public taskStateRoots;

    /// @notice Market prices (packed into one storage slot)
    struct PriceData {
        uint64 yesPrice;   // 0-10000 basis points
        uint64 noPrice;    // 0-10000 basis points
        uint128 timestamp; // block.timestamp
    }
    mapping(bytes32 => PriceData) public marketPrices;

    event CallbackReceived(
        bytes32 indexed taskId,
        bytes32 indexed stateRoot,
        bytes32 matchId
    );

    event PricesUpdated(
        bytes32 indexed marketId,
        uint64 yesPrice,
        uint64 noPrice
    );

    event BalancesApplied(
        bytes32 indexed taskId,
        bytes32 indexed stateRoot,
        uint256 usersUpdated
    );

    event WithdrawalsApplied(
        bytes32 indexed taskId,
        uint256 withdrawalsProcessed
    );

    error NotIExecHub();
    error TaskAlreadyProcessed();
    error EmptyCallback();
    error TaskNotProcessed();

    modifier onlyIExecHub() {
        if (msg.sender != iexecHub) revert NotIExecHub();
        _;
    }

    /// @param _stateAnchor Address of the StateAnchor contract
    /// @param _privateToken Address of the PrivateToken contract
    /// @param _iexecHub Address of the iExec PoCo hub
    constructor(
        address _stateAnchor,
        address _privateToken,
        address _iexecHub
    ) Ownable(msg.sender) {
        stateAnchor = IStateAnchor(_stateAnchor);
        privateToken = IPrivateToken(_privateToken);
        iexecHub = _iexecHub;
    }

    /// @notice ERC1154 callback invoked by iExec after TEE task completion
    /// @dev Processes everything in one call: commits state root, stores prices,
    ///      and updates encrypted balances. Must fit within 200k gas limit.
    ///      Payload schema: (bytes32 stateRoot, bytes32 matchId, bytes attestation,
    ///                       bytes32 marketId, uint64 yesPrice, uint64 noPrice,
    ///                       address[] users, bytes[] encryptedBalances)
    /// @param _taskId The iExec task identifier
    /// @param _callbackData ABI-encoded callback payload from the TEE
    function receiveResult(bytes32 _taskId, bytes calldata _callbackData) external onlyIExecHub whenNotPaused {
        if (processedTasks[_taskId]) revert TaskAlreadyProcessed();
        if (_callbackData.length == 0) revert EmptyCallback();

        processedTasks[_taskId] = true;

        // Decode full payload
        (
            bytes32 stateRoot,
            bytes32 matchId,
            bytes memory attestation,
            bytes32 marketId,
            uint64 yesPrice,
            uint64 noPrice,
            address[] memory users,
            bytes[] memory encryptedBalances
        ) = abi.decode(_callbackData, (bytes32, bytes32, bytes, bytes32, uint64, uint64, address[], bytes[]));

        // Store state root for fallback balance updates
        taskStateRoots[_taskId] = stateRoot;

        // 1. Commit state root to StateAnchor
        stateAnchor.commitRoot(stateRoot, matchId, attestation);

        // 2. Store prices on-chain
        marketPrices[marketId] = PriceData({
            yesPrice: yesPrice,
            noPrice: noPrice,
            timestamp: uint128(block.timestamp)
        });
        emit PricesUpdated(marketId, yesPrice, noPrice);

        // 3. Balance updates skipped in callback (200k gas limit)
        //    Use applyBalanceUpdate() separately for balance data

        emit CallbackReceived(_taskId, stateRoot, matchId);
    }

    /// @notice Get current market prices
    /// @param marketId The market identifier
    /// @return yesPrice YES price in basis points (0-10000)
    /// @return noPrice NO price in basis points (0-10000)
    /// @return timestamp When prices were last updated
    function getMarketPrices(bytes32 marketId) external view returns (uint64 yesPrice, uint64 noPrice, uint128 timestamp) {
        PriceData memory p = marketPrices[marketId];
        return (p.yesPrice, p.noPrice, p.timestamp);
    }

    /// @notice Apply balance updates from a completed TEE task (fallback for gas overflow)
    /// @param _taskId The task ID that produced these balance updates
    /// @param users Array of user addresses
    /// @param encryptedBalances Array of encrypted balance bytes
    function applyBalanceUpdate(
        bytes32 _taskId,
        address[] calldata users,
        bytes[] calldata encryptedBalances
    ) external onlyOwner whenNotPaused {
        bytes32 stateRoot = taskStateRoots[_taskId];
        if (stateRoot == bytes32(0)) revert TaskNotProcessed();

        privateToken.batchUpdateBalances(users, encryptedBalances, stateRoot);

        emit BalancesApplied(_taskId, stateRoot, users.length);
    }

    /// @notice Apply withdrawals from a completed TEE task
    /// @param _taskId The task ID that produced these withdrawals
    /// @param users Array of user addresses to withdraw to
    /// @param amounts Array of withdrawal amounts
    /// @param proofs Array of withdrawal proofs (for replay prevention)
    function applyWithdrawals(
        bytes32 _taskId,
        address[] calldata users,
        uint256[] calldata amounts,
        bytes[] calldata proofs
    ) external onlyOwner whenNotPaused {
        if (taskStateRoots[_taskId] == bytes32(0)) revert TaskNotProcessed();
        if (users.length != amounts.length || users.length != proofs.length) revert EmptyCallback();

        for (uint256 i = 0; i < users.length; ) {
            privateToken.processWithdrawal(users[i], amounts[i], proofs[i]);
            unchecked { ++i; }
        }

        emit WithdrawalsApplied(_taskId, users.length);
    }

    // Admin functions

    /// @notice Update the iExec hub address
    function setIExecHub(address _iexecHub) external onlyOwner {
        iexecHub = _iexecHub;
    }

    /// @notice Update the StateAnchor contract reference
    function setStateAnchor(address _stateAnchor) external onlyOwner {
        stateAnchor = IStateAnchor(_stateAnchor);
    }

    /// @notice Update the PrivateToken contract reference
    function setPrivateToken(address _privateToken) external onlyOwner {
        privateToken = IPrivateToken(_privateToken);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }
}
