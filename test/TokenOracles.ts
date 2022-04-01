import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers, waffle } from 'hardhat';
import { CmkUsdcTwapPriceOracle, TokenOracles } from '../typechain';

describe('Token Oracles', () => {
  let tokenOracles: TokenOracles;
  let cmkOracle: CmkUsdcTwapPriceOracle;
  let deployer: SignerWithAddress;
  let alice: SignerWithAddress;
  let bob: SignerWithAddress;
  let oracleManager: SignerWithAddress;
  let minterRole = ethers.utils.id('MINTER_ROLE');
  let ORACLE_MANAGER = ethers.utils.id('ORACLE_MANAGER');
  let DEFAULT_ADMIN_ROLE = ethers.utils.id('DEFAULT_ADMIN_ROLE');
  const fixture = async () => {
    [deployer, oracleManager, alice, bob] = await ethers.getSigners();
    const tokenOraclesFactory = await ethers.getContractFactory(
      'TokenOracles'
    );

    const tokenOracles = (await tokenOraclesFactory.deploy(oracleManager.address)) as TokenOracles;
    return tokenOracles;
  };

  beforeEach(async () => {

    tokenOracles = await waffle.loadFixture(fixture);
    
    [deployer, oracleManager, alice, bob] = await ethers.getSigners();
    const cmkPriceOracleFactory = await ethers.getContractFactory(
        'CmkUsdcTwapPriceOracle'
    )
    cmkOracle = (await cmkPriceOracleFactory.deploy(oracleManager.address)) as CmkUsdcTwapPriceOracle;
  });

  it('should construct', async () => {
    expect(await tokenOracles.hasRole(ORACLE_MANAGER, oracleManager.address)).to.equal(true);
  });

  describe('#addOracles', () => {
    it('should be done by ORACLE_ROLE', async () => {
        expect(await tokenOracles.connect(oracleManager).setTokenOracle("0x68CFb82Eacb9f198d508B514d898a403c449533E",cmkOracle.address))
        console.log(await tokenOracles.getLatestPrice("0x68CFb82Eacb9f198d508B514d898a403c449533E").then(console.log))
        });
    });

describe('#addOracles', () => {
    it('should be able to fetch CMK Price', async () => {
            
        });
    });
});