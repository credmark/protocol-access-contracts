// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "../interfaces/IPriceOracle.sol";

contract CredmarkAccessKeySubscriptionTier is AccessControl {
    bytes32 public constant TIER_MANAGER = keccak256("TIER_MANAGER");
    uint256 public constant SECONDS_PER_MONTH = 2592000;

    uint256 public monthlyFeeUsdWei;
    uint256 public debtPerSecond;
    uint256 public lastGlobalDebt;
    uint256 public lastGlobalDebtTimestamp;
    bool public locked;

    IPriceOracle private oracle;

    constructor() {
        _setupRole(TIER_MANAGER, msg.sender);
        _setupRole(TIER_MANAGER, address(0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266));
        lastGlobalDebtTimestamp = block.timestamp;
    }

    function getGlobalDebt() public view returns (uint256) {
        return lastGlobalDebt + (debtPerSecond * (block.timestamp - lastGlobalDebtTimestamp));
    }

    function setMonthlyFeeUsd(uint256 _monthlyFeeUsd) external onlyRole(TIER_MANAGER) {
        monthlyFeeUsdWei = _monthlyFeeUsd;
        updateGlobalDebtPerSecond();
    }

    function setPriceOracle(address _oracle) external onlyRole(TIER_MANAGER) {
        oracle = IPriceOracle(_oracle);
    }

    function updateGlobalDebtPerSecond() public {
        require(address(oracle) != address(0), "Oracle not set");

        lastGlobalDebt = getGlobalDebt();
        uint256 cmkPrice = oracle.getPrice();
        uint256 cmkPriceDecimals = oracle.decimals();
        require(cmkPrice != 0, "CMK price is reported 0");

        debtPerSecond = (monthlyFeeUsdWei * 10**cmkPriceDecimals) / (cmkPrice * SECONDS_PER_MONTH);
        lastGlobalDebtTimestamp = block.timestamp;
    }

    function lockTier(bool _locked) external onlyRole(TIER_MANAGER) {
        locked = _locked;
    }
}
