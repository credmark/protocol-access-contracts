import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers, waffle } from 'hardhat';
import {
  CredmarkAccessKey,
  CredmarkAccessProvider,
  MockCMK,
  StakedCredmark,
} from '../typechain';

describe('Credmark Access Provider', () => {
  let cmk: MockCMK;
  let wallet: SignerWithAddress;
  let otherWallet: SignerWithAddress;
  let credmarkDao: SignerWithAddress;
  let credmarkAccessKey: CredmarkAccessKey;
  let credmarkAccessProvider: CredmarkAccessProvider;

  const cmkFeePerSec = BigNumber.from(100);
  const liquidatorRewardBp = BigNumber.from(500);
  const stakedCmkSweepShareBp = BigNumber.from(5000);

  const fixture = async (): Promise<
    [MockCMK, CredmarkAccessKey, CredmarkAccessProvider]
  > => {
    const mockCmkFactory = await ethers.getContractFactory('MockCMK');
    const _cmk = (await mockCmkFactory.deploy()) as MockCMK;

    const stakedCmkFactory = await ethers.getContractFactory('StakedCredmark');
    const _stakedCmk = (await stakedCmkFactory.deploy(
      _cmk.address
    )) as StakedCredmark;

    const credmarkAccessKeyFactory = await ethers.getContractFactory(
      'CredmarkAccessKey'
    );
    const _credmarkAccessKey = (await credmarkAccessKeyFactory.deploy(
      _stakedCmk.address,
      _cmk.address,
      credmarkDao.address,
      cmkFeePerSec,
      liquidatorRewardBp,
      stakedCmkSweepShareBp
    )) as CredmarkAccessKey;

    const credmarkAccessProviderFactory = await ethers.getContractFactory(
      'CredmarkAccessProvider'
    );
    const _credmarkAccessProvider = (await credmarkAccessProviderFactory.deploy(
      _credmarkAccessKey.address
    )) as CredmarkAccessProvider;

    return [_cmk, _credmarkAccessKey, _credmarkAccessProvider];
  };

  beforeEach(async () => {
    [wallet, otherWallet, credmarkDao] = await ethers.getSigners();
    [cmk, credmarkAccessKey, credmarkAccessProvider] = await waffle.loadFixture(
      fixture
    );
  });

  it('should authorize token owner', async () => {
    const initialMintAmount = BigNumber.from(1000);
    await cmk.approve(credmarkAccessKey.address, initialMintAmount.mul(100));
    await expect(credmarkAccessKey.mint(initialMintAmount))
      .to.emit(credmarkAccessKey, 'AccessKeyMinted')
      .withArgs(BigNumber.from(0));
    const tokenId = BigNumber.from(0);

    expect(
      await credmarkAccessProvider.authorize(wallet.address, tokenId)
    ).to.be.equal(true);
  });

  it('should not authorize other than token owner', async () => {
    const initialMintAmount = BigNumber.from(1000);
    await cmk.approve(credmarkAccessKey.address, initialMintAmount.mul(100));
    await expect(credmarkAccessKey.mint(initialMintAmount))
      .to.emit(credmarkAccessKey, 'AccessKeyMinted')
      .withArgs(BigNumber.from(0));
    const tokenId = BigNumber.from(0);

    expect(
      await credmarkAccessProvider.authorize(otherWallet.address, tokenId)
    ).to.be.equal(false);
  });

  it('should not authorize token owner when liquidated', async () => {
    const initialMintAmount = BigNumber.from(1000);
    await cmk.approve(credmarkAccessKey.address, initialMintAmount.mul(100));
    await credmarkAccessKey.mint(initialMintAmount);
    const tokenId = BigNumber.from(0);

    const sevenDays = 7 * 24 * 60 * 60;
    await ethers.provider.send('evm_increaseTime', [sevenDays]);
    await ethers.provider.send('evm_mine', []);

    // expect(await credmarkAccessKey.isLiquidateable(tokenId)).to.be.equal(true);
    expect(
      await credmarkAccessProvider.authorize(wallet.address, tokenId)
    ).to.be.equal(false);
  });
});
