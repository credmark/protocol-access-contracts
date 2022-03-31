// SPDX-License-Identifier: MIT
pragma solidity ^0.8.2;

interface IPriceOracle {
    function getPrice() external returns (uint256 price);

    function decimals() external returns (uint8 decimals);
}
