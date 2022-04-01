import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers, waffle } from 'hardhat';
import { CmkUsdcTwapPriceOracle, CredmarkMembershipRegistry, CredmarkMembershipRewardsPool, CredmarkMembershipTier, CredmarkMembershipToken, TokenOracles, ChainlinkPriceOracle } from '../typechain';

describe('Token Oracles', () => {

  let tokenOracles: TokenOracles;
  let cmkOracle: CmkUsdcTwapPriceOracle;
  let registry: CredmarkMembershipRegistry;
  let token: CredmarkMembershipToken;
  let rewardsPool: CredmarkMembershipRewardsPool;
  let tier1: CredmarkMembershipTier;
  let tier2: CredmarkMembershipTier;
  let tier3: CredmarkMembershipTier;
  let usdcOracle: ChainlinkPriceOracle;

  let deployer: SignerWithAddress;

  let oracleManager: SignerWithAddress;
  let tierManager: SignerWithAddress;
  let rewardsManager: SignerWithAddress;
  let registryManager: SignerWithAddress;

  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let chris: SignerWithAddress;
  let david: SignerWithAddress;
  let ethan: SignerWithAddress;
  let fran: SignerWithAddress;
  let grace: SignerWithAddress;

  let hAcKz0r: SignerWithAddress;

  let REGISTRY_MANAGER = ethers.utils.id('REGISTRY_MANAGER');
  let ORACLE_MANAGER = ethers.utils.id('ORACLE_MANAGER');
  let REWARDS_MANAGER = ethers.utils.id('REWARDS_MANAGER');
  let TIER_MANAGER = ethers.utils.id('TIER_MANAGER');

  let cmkAddress = "0x68CFb82Eacb9f198d508B514d898a403c449533E";
  let usdcUsdChainlinkOracle="0x8fffffd4afb6115b954bd326cbe7b4ba576818f6";
  let ethUsdChainlinkOracle="0x5f4ec3df9cbd43714fe2740f5e3616155c5b8419";
  let usdcAddress = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48";

  beforeEach(async () => {
    [
        deployer, oracleManager, tierManager, rewardsManager, registryManager, 
        alice, bob, chris, david, ethan, fran, grace,
        hAcKz0r
    ] = await ethers.getSigners();
    const tokenOraclesFactory = await ethers.getContractFactory('TokenOracles');
    const registryFactory = await ethers.getContractFactory('CredmarkMembershipRegistry');
    const tierFactory = await ethers.getContractFactory('CredmarkMembershipTier');
    const tokenFactory = await ethers.getContractFactory('CredmarkMembershipToken');
    const rewardsPoolFactory = await ethers.getContractFactory('CredmarkMembershipRewardsPool');
    const cmkPriceOracleFactory = await ethers.getContractFactory('CmkUsdcTwapPriceOracle');
    const chainlinkPriceOracleFactory = await ethers.getContractFactory('ChainlinkPriceOracle');

    registry = (await registryFactory.deploy(registryManager.address)) as CredmarkMembershipRegistry;
    tokenOracles = (await tokenOraclesFactory.deploy(oracleManager.address)) as TokenOracles;
    await registry.connect(registryManager).addOracle(tokenOracles.address);
    cmkOracle = (await cmkPriceOracleFactory.deploy()) as CmkUsdcTwapPriceOracle;
    usdcOracle = (await chainlinkPriceOracleFactory.deploy(usdcUsdChainlinkOracle)) as ChainlinkPriceOracle;
    await tokenOracles.connect(oracleManager).setTokenOracle(cmkAddress, cmkOracle.address);
    await tokenOracles.connect(oracleManager).setTokenOracle(usdcAddress, usdcOracle.address);

    token = (await tokenFactory.deploy(registry.address)) as CredmarkMembershipToken;
    registry.connect(registryManager).setMembershipToken(token.address);

    rewardsPool = (await rewardsPoolFactory.deploy(registry.address, cmkAddress, token.address)) as CredmarkMembershipRewardsPool;
    registry.connect(registryManager).addRewardsPool(rewardsPool.address);
    
    
    
    
    
    tier1 = (await tierFactory.deploy(
        registry.address,
        tierManager.address,
        [
        100,// uint256 multiplier ;
        0,// uint256 lockupSeconds;
        0,// uint256 feePerSecond;
        true,// bool subscribable;
        cmkAddress,// IERC20 baseToken;
        usdcAddress // IERC20 feeToken;
        ]
    )) as CredmarkMembershipTier;
    await registry.addOracle(tokenOracles.address);
  });

  it('should construct', async () => {
    expect(await tokenOracles.hasRole(ORACLE_MANAGER, oracleManager.address)).to.equal(true);
  });
});