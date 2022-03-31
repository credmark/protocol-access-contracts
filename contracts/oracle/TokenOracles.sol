// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "@uniswap/v3-core/contracts/libraries/TickMath.sol";

import "./IPriceOracle.sol";

contract TokenOracles is AccessControl {

    bytes32 public constant ORACLE_MANAGER = keccak256("ORACLE_MANAGER");
    mapping(IERC20 => IPriceOracle) internal oracles;

    constructor(address oracleManager) 
    {
        grantRole(ORACLE_MANAGER, oracleManager);
    }

    function setTokenOracle(IERC20 token, IPriceOracle oracle) 
        external 
        onlyRole(ORACLE_MANAGER) 
    {
        oracles[token] = oracle;
    }

    /* just a convenience function, delete if unneccessary */
    function getLatestPrice(IERC20 token) 
        external 
        view 
        returns (uint price, uint8 decimals) 
    {
        return (oracles[token].getPrice(), oracles[token].decimals());
    }

    function getLatestRelative(IERC20 _base, IERC20 _quote)
        public
        view
        returns (uint price, uint8 decimals)
    {
        uint basePrice = oracles[_base].getPrice();
        uint8 baseDecimals =  oracles[_base].decimals();
        basePrice = scalePrice(basePrice, baseDecimals, _base.decimals());

        uint quotePrice = oracles[_quote].getPrice();
        uint8 quoteDecimals = oracles[_quote].decimals();
        quotePrice = scalePrice(quotePrice, quoteDecimals, _quote.decimals());

        return (basePrice * _base.decimals() / quotePrice, _base.decimals());
    }

    function scalePrice(uint256 _price, uint8 _priceDecimals, uint8 _decimals)
        internal
        pure
        returns (uint)
    {
        if (_priceDecimals < _decimals) {
            return _price * (10 ** uint256(_decimals - _priceDecimals));
        } else if (_priceDecimals > _decimals) {
            return _price / (10 ** uint256(_priceDecimals - _decimals));
        }
        return _price;
    }
}

contract ChainlinkPriceOracle is IPriceOracle {

    AggregatorV3Interface internal _oracle;

    constructor(AggregatorV3Interface oracle) {
        _oracle = oracle;
    }

    function getPrice() 
        public 
        view 
        override 
        returns (uint) 
    {
        (,int latestPrice,,,) = _oracle.latestRoundData();
        require(latestPrice <= 0, "No data present");
        return uint(latestPrice);
    }

    function decimals() 
        public 
        view 
        override 
        returns(uint8) 
    {
        return _oracle.decimals();
    }
}

contract CmkUsdcTwapPriceOracle is IPriceOracle {
    bytes32 public constant PRICE_MANAGER = keccak256("PRICE_MANAGER");
    
    uint internal MIN_SAMPLE_LENGTH_S = 3600;
    uint internal X96 = 0x1000000000000000000000000;
    uint internal X192 = 0x1000000000000000000000000000000000000000000000000;
    uint internal X192_DIV_TEN_20 = 0x2f394219248446baa23d2ec729af3d61;
    uint internal BUFFER_LENGTH = 4;
    uint[] internal buffer = uint[](BUFFER_LENGTH);
    uint internal lastSampleTimestamp;
    uint internal lastSampleidx;

    IUniswapV3Pool cmkUsdcPool = IUniswapV3Pool(0xF7a716E2df2BdE4D0BA7656c131b06b1Af68513c);

    constructor(address priceManager) 
    {
        grantRole(PRICE_MANAGER, priceManager);

        //Fill the buffer with the instantaneous price
        (uint160 sqrtPriceX96,,,,,,) = IUniswapV3Pool(uniswapV3Pool).slot0(timeRange);
        for(int i=0; i<BUFFER_LENGTH; i++) {
            samples[i] = sqrtPriceX96;
        }
    }

    function sample() 
        public 
    {
        if( block.timestamp > lastSampleTimestamp + MIN_SAMPLE_LENGTH_S) {
            lastSampleidx = (lastSampleidx + 1) % BUFFER_LENGTH;
            (uint160 sqrtPriceX96,,,,,,) = IUniswapV3Pool(uniswapV3Pool).slot0(timeRange);
            samples[lastSampleidx] = sqrtPriceX96;
            uint lastSampleTimestamp = block.timestamp;
        }
    }

    function getPrice() 
        external 
        view 
        returns (uint) 
    {
        uint sqrtPriceX96twap;
        for(int i = 0; i< BUFFER_LENGTH; i++) {
            x96twap += (buffer[i]/BUFFER_LENGTH);
        }
        return sqrtPriceX96twap ** 2 / X192_DIV_TEN_20;
    }

    function decimals() 
        external 
        view 
        returns (uint) 
    {
        return 8;
    }

}