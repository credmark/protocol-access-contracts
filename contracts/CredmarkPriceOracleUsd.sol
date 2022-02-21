// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

import "@openzeppelin/contracts/access/AccessControl.sol";

contract CredmarkPriceOracleUsd is AccessControl {
    bytes32 public constant ORACLE_MANAGER = keccak256("ORACLE_MANAGER");

    uint256 public cmkPrice;

    constructor() {
        _setupRole(ORACLE_MANAGER, address(0x0));
    }

    function updateOracle(uint256 _cmkPrice) external onlyRole(ORACLE_MANAGER) {
        cmkPrice = _cmkPrice;
    }
}
