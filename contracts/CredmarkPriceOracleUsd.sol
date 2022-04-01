// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "./interfaces/IPriceOracle.sol";

contract CredmarkPriceOracleUsd is AccessControl, IPriceOracle {
    bytes32 public constant ORACLE_MANAGER = keccak256("ORACLE_MANAGER");

    uint256 private cmkPrice;

    constructor() {
        _grantRole(ORACLE_MANAGER, msg.sender);
    }

    function decimals() external pure override returns (uint8) {
        return 4;
    }

    function getPrice() external view override returns (uint256) {
        return cmkPrice;
    }

    function updateOracle(uint256 _cmkPrice) external onlyRole(ORACLE_MANAGER) {
        cmkPrice = _cmkPrice;
    }
}
