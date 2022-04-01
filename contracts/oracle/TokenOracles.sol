// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/access/AccessControl.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "../interfaces/IPriceOracle.sol";

contract TokenOracles is AccessControl {
    bytes32 public constant ORACLE_MANAGER = keccak256("ORACLE_MANAGER");
    mapping(IERC20 => IPriceOracle) internal oracles;

    constructor(address oracleManager) {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(ORACLE_MANAGER, oracleManager);
    }

    function setTokenOracle(ERC20 token, IPriceOracle oracle)
        external
        onlyRole(ORACLE_MANAGER)
    {
        oracles[token] = oracle;
    }

    /* just a convenience function, delete if unneccessary */
    function getLatestPrice(ERC20 token)
        external 
        view
        returns (uint256 price, uint8 decimals)
    {
        return (oracles[token].getPrice(), oracles[token].decimals());
    }

    function getLatestRelative(IERC20 _base, IERC20 _quote)
        public
        returns (uint256 price, uint8 decimals)
    {
        uint256 basePrice = oracles[_base].getPrice();
        uint8 baseDecimals = oracles[_base].decimals();
        basePrice = scalePrice(
            basePrice,
            baseDecimals,
            ERC20(address(_base)).decimals()
        );

        uint256 quotePrice = oracles[_quote].getPrice();
        uint8 quoteDecimals = oracles[_quote].decimals();
        quotePrice = scalePrice(
            quotePrice,
            quoteDecimals,
            ERC20(address(_quote)).decimals()
        );

        return (
            (basePrice * ERC20(address(_base)).decimals()) / quotePrice,
            ERC20(address(_base)).decimals()
        );
    }

    function scalePrice(
        uint256 _price,
        uint8 _priceDecimals,
        uint8 _decimals
    ) internal pure returns (uint256) {
        if (_priceDecimals < _decimals) {
            return _price * (10**uint256(_decimals - _priceDecimals));
        } else if (_priceDecimals > _decimals) {
            return _price / (10**uint256(_priceDecimals - _decimals));
        }
        return _price;
    }

    function getPriceOracle(IERC20 token) external view returns (IPriceOracle) {
        return oracles[token];
    }
}

