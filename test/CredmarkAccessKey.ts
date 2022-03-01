import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers, waffle } from 'hardhat';
import { CredmarkAccessKey, MockCMK, StakedCredmark } from '../typechain';

describe('Credmark Access Key', () => {
  let cmk: MockCMK;
  let stakedCmk: StakedCredmark;
  let credmarkAccessKey: CredmarkAccessKey;
  let wallet: SignerWithAddress;
  let otherWallet: SignerWithAddress;
  let credmarkDao: SignerWithAddress;

  const cmkFeePerSec = BigNumber.from(100);
  const liquidatorRewardBp = BigNumber.from(500);
  const stakedCmkSweepShareBp = BigNumber.from(4000);

  const fixture = async (): Promise<
    [MockCMK, StakedCredmark, CredmarkAccessKey]
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

    return [_cmk, _stakedCmk, _credmarkAccessKey];
  };

  beforeEach(async () => {
    [wallet, otherWallet, credmarkDao] = await ethers.getSigners();
    [cmk, stakedCmk, credmarkAccessKey] = await waffle.loadFixture(fixture);
  });

  describe('#fee', () => {
    it('should get current fee', async () => {
      const feeCount = await credmarkAccessKey.getFeesCount();
      const fee = await credmarkAccessKey.fees(feeCount.sub(1));
      expect(fee.feePerSecond).to.be.equal(cmkFeePerSec);
    });

    it('should allow owner to set fee', async () => {
      const newFee = BigNumber.from(2000);
      await expect(credmarkAccessKey.setFee(newFee))
        .to.emit(credmarkAccessKey, 'FeeChanged')
        .withArgs(newFee);
      const feeCount = await credmarkAccessKey.getFeesCount();
      expect(feeCount).to.be.equal(BigNumber.from(2));
      const fee = await credmarkAccessKey.fees(feeCount.sub(1));
      expect(fee.feePerSecond).to.be.equal(newFee);
    });

    it('should not allow non owner to set fee', async () => {
      const newFee = BigNumber.from(2000);
      await expect(
        credmarkAccessKey.connect(otherWallet).setFee(newFee)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('#stakedCmkSweepShare', () => {
    const newStakedCmkSweepShareBp = BigNumber.from(8000);

    it('should get current stakedCmkSweepShareBp', async () => {
      expect(await credmarkAccessKey.stakedCmkSweepShareBp()).to.be.equal(
        stakedCmkSweepShareBp
      );
    });

    it('should allow owner to set stakedCmkSweepShare', async () => {
      await expect(
        credmarkAccessKey.setStakedCmkSweepShare(newStakedCmkSweepShareBp)
      )
        .to.emit(credmarkAccessKey, 'StakedCmkSweepShareChanged')
        .withArgs(newStakedCmkSweepShareBp);

      expect(await credmarkAccessKey.stakedCmkSweepShareBp()).to.be.equal(
        newStakedCmkSweepShareBp
      );
    });

    it('should not allow to set invalid bp', async () => {
      await expect(
        credmarkAccessKey.setStakedCmkSweepShare(BigNumber.from(10001))
      ).to.be.revertedWith('Basis Point not in 0-10000 range');
      await expect(credmarkAccessKey.setStakedCmkSweepShare(BigNumber.from(-1)))
        .to.be.reverted;
    });

    it('should not allow non owner to set stakedCmkSweepShare', async () => {
      await expect(
        credmarkAccessKey
          .connect(otherWallet)
          .setStakedCmkSweepShare(newStakedCmkSweepShareBp)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('#liquidatorReward', () => {
    const newLiquidatorRewardBp = BigNumber.from(8000);

    it('should get current liquidatorRewardBp', async () => {
      expect(await credmarkAccessKey.liquidatorRewardBp()).to.be.equal(
        liquidatorRewardBp
      );
    });

    it('should allow owner to set liquidatorReward', async () => {
      await expect(credmarkAccessKey.setLiquidatorReward(newLiquidatorRewardBp))
        .to.emit(credmarkAccessKey, 'LiquidatorRewardChanged')
        .withArgs(newLiquidatorRewardBp);
      expect(await credmarkAccessKey.liquidatorRewardBp()).to.be.equal(
        newLiquidatorRewardBp
      );
    });

    it('should not allow to set invalid bp', async () => {
      await expect(
        credmarkAccessKey.setLiquidatorReward(BigNumber.from(10001))
      ).to.be.revertedWith('Basis Point not in 0-10000 range');
      await expect(credmarkAccessKey.setLiquidatorReward(BigNumber.from(-1))).to
        .be.reverted;
    });

    it('should not allow non owner to set liquidatorReward', async () => {
      await expect(
        credmarkAccessKey
          .connect(otherWallet)
          .setLiquidatorReward(newLiquidatorRewardBp)
      ).to.be.revertedWith('Ownable: caller is not the owner');
    });
  });

  describe('#mint', () => {
    it('should mint nft', async () => {
      const initialMintAmount = BigNumber.from(1000);
      await cmk.approve(credmarkAccessKey.address, initialMintAmount.mul(100));
      await expect(credmarkAccessKey.mint(initialMintAmount))
        .to.emit(credmarkAccessKey, 'AccessKeyMinted')
        .withArgs(BigNumber.from(0));
      const tokenId = BigNumber.from(0);
      expect(await credmarkAccessKey.balanceOf(wallet.address)).to.be.equal(
        BigNumber.from(1)
      );
      expect(
        await credmarkAccessKey.tokenOfOwnerByIndex(wallet.address, 0)
      ).to.be.equal(tokenId);
      expect(await credmarkAccessKey.cmkValue(tokenId)).to.be.equal(
        initialMintAmount
      );
    });

    it('should add cmk to token', async () => {
      const initialMintAmount = BigNumber.from(1000);
      await cmk.approve(credmarkAccessKey.address, initialMintAmount.mul(100));
      await credmarkAccessKey.mint(initialMintAmount);
      const tokenId = BigNumber.from(0);

      await credmarkAccessKey.addCmk(tokenId, initialMintAmount);
      expect(await credmarkAccessKey.cmkValue(tokenId)).to.be.equal(
        initialMintAmount.mul(2)
      );
    });

    it('should accumulate fees with time', async () => {
      const initialMintAmount = BigNumber.from(100000000);
      await cmk.approve(credmarkAccessKey.address, initialMintAmount.mul(100));
      await credmarkAccessKey.mint(initialMintAmount);
      const tokenId = BigNumber.from(0);

      const sevenDays = 7 * 24 * 60 * 60;
      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      expect(await credmarkAccessKey.feesAccumulated(tokenId)).to.be.closeTo(
        cmkFeePerSec.mul(sevenDays),
        cmkFeePerSec.mul(5).toNumber()
      );
    });

    it('should accumulate fees with time proportional to fee duration', async () => {
      const initialMintAmount = BigNumber.from(10);
      await cmk.approve(credmarkAccessKey.address, initialMintAmount.mul(100));

      const oneDay = 24 * 60 * 60;
      await ethers.provider.send('evm_increaseTime', [oneDay]);
      await ethers.provider.send('evm_mine', []);

      await credmarkAccessKey.mint(initialMintAmount);
      const tokenId = BigNumber.from(0);

      const sevenDays = 7 * 24 * 60 * 60;
      await ethers.provider.send('evm_increaseTime', [sevenDays - oneDay]);
      await ethers.provider.send('evm_mine', []);

      expect(await credmarkAccessKey.feesAccumulated(tokenId)).to.be.closeTo(
        cmkFeePerSec.mul(sevenDays - oneDay),
        cmkFeePerSec.mul(5).toNumber()
      );

      await credmarkAccessKey.setFee(cmkFeePerSec.mul(2));
      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      expect(await credmarkAccessKey.feesAccumulated(tokenId)).to.be.closeTo(
        cmkFeePerSec
          .mul(sevenDays - oneDay)
          .add(cmkFeePerSec.mul(2).mul(sevenDays)),
        cmkFeePerSec.mul(5).toNumber()
      );
    });
  });

  describe('#burn', () => {
    it('should burn nft', async () => {
      const initialMintAmount = BigNumber.from(1000);
      await cmk.approve(credmarkAccessKey.address, initialMintAmount.mul(100));
      await credmarkAccessKey.mint(initialMintAmount);
      const tokenId = BigNumber.from(0);

      await expect(credmarkAccessKey.burn(tokenId))
        .to.emit(credmarkAccessKey, 'AccessKeyBurned')
        .withArgs(tokenId);
      expect(await credmarkAccessKey.balanceOf(wallet.address)).to.be.equal(
        BigNumber.from(0)
      );
    });

    it('should not burn nft if not owner', async () => {
      const initialMintAmount = BigNumber.from(1000);
      await cmk.approve(credmarkAccessKey.address, initialMintAmount.mul(100));
      await credmarkAccessKey.mint(initialMintAmount);
      const tokenId = BigNumber.from(0);

      await expect(
        credmarkAccessKey.connect(otherWallet).burn(tokenId)
      ).to.be.revertedWith('Only owner can burn their NFT');
      expect(await credmarkAccessKey.balanceOf(wallet.address)).to.be.equal(
        BigNumber.from(1)
      );
    });
  });

  describe('#liquidate', () => {
    it('should liquidate by owner when defaulting fees', async () => {
      const initialMintAmount = BigNumber.from(1000);
      await cmk.approve(credmarkAccessKey.address, initialMintAmount.mul(100));
      await credmarkAccessKey.mint(initialMintAmount);
      const tokenId = BigNumber.from(0);

      const sevenDays = 7 * 24 * 60 * 60;
      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      const cmkBalanceBefore = await cmk.balanceOf(wallet.address);
      await expect(credmarkAccessKey.liquidate(tokenId))
        .to.emit(credmarkAccessKey, 'AccessKeyBurned')
        .withArgs(tokenId)
        .and.to.emit(credmarkAccessKey, 'AccessKeyLiquidated')
        .withArgs(
          tokenId,
          wallet.address,
          initialMintAmount.mul(liquidatorRewardBp).div(10000)
        );

      expect(await credmarkAccessKey.balanceOf(wallet.address)).to.be.equal(
        BigNumber.from(0)
      );

      const cmkBalanceAfter = await cmk.balanceOf(wallet.address);
      expect(cmkBalanceAfter.sub(cmkBalanceBefore)).to.be.equal(
        initialMintAmount.mul(liquidatorRewardBp).div(10000)
      );
    });

    it('should liquidate by non owner when defaulting fees', async () => {
      const initialMintAmount = BigNumber.from(1000);
      await cmk.approve(credmarkAccessKey.address, initialMintAmount.mul(100));
      await credmarkAccessKey.mint(initialMintAmount);
      const tokenId = BigNumber.from(0);

      const sevenDays = 7 * 24 * 60 * 60;
      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      const cmkBalanceBefore = await cmk.balanceOf(otherWallet.address);
      await expect(credmarkAccessKey.connect(otherWallet).liquidate(tokenId))
        .to.emit(credmarkAccessKey, 'AccessKeyBurned')
        .withArgs(tokenId)
        .and.to.emit(credmarkAccessKey, 'AccessKeyLiquidated')
        .withArgs(
          tokenId,
          otherWallet.address,
          initialMintAmount.mul(liquidatorRewardBp).div(10000)
        );

      expect(await credmarkAccessKey.balanceOf(wallet.address)).to.be.equal(
        BigNumber.from(0)
      );

      const cmkBalanceAfter = await cmk.balanceOf(otherWallet.address);
      expect(cmkBalanceAfter.sub(cmkBalanceBefore)).to.be.equal(
        initialMintAmount.mul(liquidatorRewardBp).div(10000)
      );
    });

    it('should not liquidate when not defaulting fees', async () => {
      const initialMintAmount = BigNumber.from(100000000);
      await cmk.approve(credmarkAccessKey.address, initialMintAmount.mul(100));
      await credmarkAccessKey.mint(initialMintAmount);
      const tokenId = BigNumber.from(0);

      const sevenDays = 7 * 24 * 60 * 60;
      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      await expect(credmarkAccessKey.liquidate(tokenId)).to.be.revertedWith(
        'Not liquidiateable'
      );
      expect(await credmarkAccessKey.balanceOf(wallet.address)).to.be.equal(
        BigNumber.from(1)
      );
    });
  });

  describe('#sweep', () => {
    it('should sweep', async () => {
      const initialMintAmount = BigNumber.from(1000);
      await cmk.approve(credmarkAccessKey.address, initialMintAmount);
      await credmarkAccessKey.mint(initialMintAmount);
      const tokenId = BigNumber.from(0);

      const sevenDays = 7 * 24 * 60 * 60;
      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      await credmarkAccessKey.burn(tokenId);
      await expect(credmarkAccessKey.sweep())
        .to.emit(credmarkAccessKey, 'Sweeped')
        .withArgs(
          initialMintAmount.mul(stakedCmkSweepShareBp).div(10000),
          initialMintAmount
            .mul(BigNumber.from(10000).sub(stakedCmkSweepShareBp))
            .div(10000)
        );

      expect(await cmk.balanceOf(stakedCmk.address)).to.be.equal(
        initialMintAmount.mul(stakedCmkSweepShareBp).div(10000)
      );
      expect(await cmk.balanceOf(credmarkDao.address)).to.be.equal(
        initialMintAmount
          .mul(BigNumber.from(10000).sub(stakedCmkSweepShareBp))
          .div(10000)
      );
    });

    it('should sweep nothing when minted token exists', async () => {
      const initialMintAmount = BigNumber.from(1000);
      await cmk.approve(credmarkAccessKey.address, initialMintAmount);
      await credmarkAccessKey.mint(initialMintAmount);

      await expect(credmarkAccessKey.sweep())
        .to.emit(credmarkAccessKey, 'Sweeped')
        .withArgs(BigNumber.from(0), BigNumber.from(0));
      expect(await cmk.balanceOf(credmarkDao.address)).to.be.equal(
        BigNumber.from(0)
      );
      expect(await cmk.balanceOf(stakedCmk.address)).to.be.equal(
        initialMintAmount
      );
    });
  });
});
