// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

import "../interfaces/IPriceOracle.sol";

contract ChainlinkPriceOracle is IPriceOracle {
    AggregatorV3Interface internal _oracle;

    constructor(AggregatorV3Interface oracle) {
        _oracle = oracle;
    }

    function getPrice() public view override returns (uint256) {
        (, int256 latestPrice, , , ) = _oracle.latestRoundData();
        require(latestPrice <= 0, "No data present");
        return uint256(latestPrice);
    }

    function decimals() public view override returns (uint8) {
        return _oracle.decimals();
    }
}
