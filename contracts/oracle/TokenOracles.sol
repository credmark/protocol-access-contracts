// SPDX-License-Identifier: MIT
pragma solidity ^0.8.7;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import "../interfaces/IPriceOracle.sol";

contract TokenOracles is AccessControl {
    bytes32 public constant ORACLE_MANAGER = keccak256("ORACLE_MANAGER");
    mapping(IERC20 => IPriceOracle) internal oracles;

    constructor(address oracleManager) {
        grantRole(ORACLE_MANAGER, oracleManager);
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

contract CmkUsdcTwapPriceOracle is IPriceOracle, AccessControl {
    bytes32 public constant PRICE_MANAGER = keccak256("PRICE_MANAGER");

    uint256 internal MIN_SAMPLE_LENGTH_S = 3600;
    uint256 internal X96 = 0x1000000000000000000000000;
    uint256 internal X192 = 0x1000000000000000000000000000000000000000000000000;
    uint256 internal X192_DIV_TEN_20 = 0x2f394219248446baa23d2ec729af3d61;
    uint256 internal BUFFER_LENGTH = 4;
    uint256[] internal buffer;
    uint256 internal lastSampleTimestamp;
    uint256 internal lastSampleidx;

    IUniswapV3Pool cmkUsdcPool =
        IUniswapV3Pool(0xF7a716E2df2BdE4D0BA7656c131b06b1Af68513c);

    constructor(address priceManager) {
        grantRole(PRICE_MANAGER, priceManager);
        buffer = new uint256[](BUFFER_LENGTH);

        //Fill the buffer with the instantaneous price
        (uint160 sqrtPriceX96, , , , , , ) = cmkUsdcPool.slot0();
        for (uint256 i = 0; i < BUFFER_LENGTH; i++) {
            buffer[i] = sqrtPriceX96;
        }
    }

    function sample() public {
        if (block.timestamp > lastSampleTimestamp + MIN_SAMPLE_LENGTH_S) {
            lastSampleidx = (lastSampleidx + 1) % BUFFER_LENGTH;
            (uint160 sqrtPriceX96, , , , , , ) = cmkUsdcPool.slot0();
            buffer[lastSampleidx] = sqrtPriceX96;
            lastSampleTimestamp = block.timestamp;
        }
    }

    function getPrice() external override returns (uint256) {
        sample();
        uint256 sqrtPriceX96twap;
        for (uint256 i = 0; i < BUFFER_LENGTH; i++) {
            sqrtPriceX96twap += (buffer[i] / BUFFER_LENGTH);
        }
        return sqrtPriceX96twap**2 / X192_DIV_TEN_20;
    }

    function decimals() external pure override returns (uint8) {
        return 8;
    }
}
