// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

interface IPriceOracle {
    function getPrice() external view returns (uint256 price);

    function decimals() external view returns (uint8 decimals);
}
