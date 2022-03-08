import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { ethers, waffle } from 'hardhat';
import {
  CredmarkAccessKey,
  MockCMK,
  CredmarkPriceOracleUsd,
  CredmarkAccessKeySubscriptionTier,
} from '../typechain';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const THIRTY_DAYS_IN_SEC = 2592000;

describe('Credmark Access Key', () => {
  let cmk: MockCMK;
  let credmarkAccessKey: CredmarkAccessKey;

  let wallet: SignerWithAddress;
  let otherWallet: SignerWithAddress;
  let credmarkDao: SignerWithAddress;
  let admin: SignerWithAddress;

  const fixture = async (): Promise<[MockCMK, CredmarkAccessKey]> => {
    const mockCmkFactory = await ethers.getContractFactory('MockCMK');
    const _cmk = (await mockCmkFactory.connect(admin).deploy()) as MockCMK;

    const credmarkAccessKeyFactory = await ethers.getContractFactory(
      'CredmarkAccessKey'
    );
    const _credmarkAccessKey = (await credmarkAccessKeyFactory
      .connect(admin)
      .deploy(_cmk.address, credmarkDao.address)) as CredmarkAccessKey;

    return [_cmk.connect(wallet), _credmarkAccessKey.connect(wallet)];
  };

  beforeEach(async () => {
    [wallet, otherWallet, credmarkDao, admin] = await ethers.getSigners();
    [cmk, credmarkAccessKey] = await waffle.loadFixture(fixture);
  });

  it('should deploy', () => {});

  describe('#mint', () => {
    it('should mint', async () => {
      const tokenId = BigNumber.from(0);
      await expect(credmarkAccessKey.safeMint(wallet.address))
        .to.emit(credmarkAccessKey, 'Transfer')
        .withArgs(ZERO_ADDRESS, wallet.address, tokenId);

      expect(await credmarkAccessKey.balanceOf(wallet.address)).to.be.equal(1);
      expect(await credmarkAccessKey.ownerOf(tokenId)).to.be.equal(
        wallet.address
      );
      expect(
        await credmarkAccessKey.tokenOfOwnerByIndex(wallet.address, 0)
      ).to.be.equal(tokenId);
    });
  });

  describe('#subscriptionTier', () => {
    it('should create subscription tier', async () => {
      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigNumber.from(2514)); // $0.2514

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
        BigNumber.from(100).mul(BigNumber.from(10).pow(18)),
        3600, // 1hour
        true
      );

      expect(await credmarkAccessKey.totalSupportedTiers()).to.be.equal(
        BigNumber.from(1)
      );

      const newTierAddress = await credmarkAccessKey.supportedTiers(0);
      const newTier = (await ethers.getContractAt(
        'CredmarkAccessKeySubscriptionTier',
        newTierAddress
      )) as CredmarkAccessKeySubscriptionTier;

      expect(await newTier.subscribable()).to.be.equal(true);
      expect(await newTier.monthlyFeeUsdWei()).to.be.equal(
        BigNumber.from(100).mul(BigNumber.from(10).pow(18))
      );
      expect(await newTier.debtPerSecond()).to.be.equal(
        BigNumber.from(100)
          .mul(BigNumber.from(10).pow(18))
          .mul(10000)
          .div(2514)
          .div(THIRTY_DAYS_IN_SEC)
      );
    });

    it('should not create subscription tier for non tier managers', async () => {
      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigNumber.from(2514)); // $0.2514

      await expect(
        credmarkAccessKey.connect(otherWallet).createSubscriptionTier(
          admin.address,
          oracle.address,
          BigNumber.from(100).mul(BigNumber.from(10).pow(18)),
          3600, // 1hour
          true
        )
      ).to.be.reverted;
    });
  });

  describe('#subscribe', () => {
    it('should subscribe', async () => {
      const tokenId = BigNumber.from(0);
      const fundAmount = BigNumber.from(1000);

      await cmk.connect(admin).transfer(wallet.address, fundAmount);

      await credmarkAccessKey.safeMint(wallet.address);
      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigNumber.from(2514)); // $0.2514

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
        BigNumber.from(100).mul(BigNumber.from(10).pow(18)),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      await credmarkAccessKey.subscribe(tokenId, subscriptionTierAddress);
    });

    it('should not subscribe unsupported tier', async () => {
      const tokenId = BigNumber.from(0);
      const fundAmount = BigNumber.from(1000);

      await cmk.connect(admin).transfer(wallet.address, fundAmount);

      await credmarkAccessKey.safeMint(wallet.address);
      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigNumber.from(2514)); // $0.2514

      const newTierFactory = await ethers.getContractFactory(
        'CredmarkAccessKeySubscriptionTier'
      );

      const newTier = (await newTierFactory.deploy(
        admin.address,
        oracle.address,
        BigNumber.from(100).mul(BigNumber.from(10).pow(18)),
        BigNumber.from(3600), // 1hour
        cmk.address
      )) as CredmarkAccessKeySubscriptionTier;

      await newTier.setSubscribable(true);

      await expect(
        credmarkAccessKey.subscribe(tokenId, newTier.address)
      ).to.be.revertedWith('Unsupported subscription');
    });

    it('should not subscribe locked tier', async () => {
      const tokenId = BigNumber.from(0);
      const fundAmount = BigNumber.from(1000);

      await cmk.connect(admin).transfer(wallet.address, fundAmount);

      await credmarkAccessKey.safeMint(wallet.address);
      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigNumber.from(2514)); // $0.2514
      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
        BigNumber.from(100).mul(BigNumber.from(10).pow(18)),
        3600, // 1hour
        false
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      await expect(
        credmarkAccessKey.subscribe(tokenId, subscriptionTierAddress)
      ).to.be.revertedWith('Tier is not subscribable');
    });
  });

  describe('#fund', () => {
    it('should fund', async () => {
      const tokenId = BigNumber.from(0);
      const fundAmount = BigNumber.from(1000);

      await cmk.connect(admin).transfer(wallet.address, fundAmount);

      await credmarkAccessKey.safeMint(wallet.address);
      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigNumber.from(2514)); // $0.2514

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
        BigNumber.from(100).mul(BigNumber.from(10).pow(18)),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      await credmarkAccessKey.subscribe(tokenId, subscriptionTierAddress);

      await credmarkAccessKey.fund(tokenId, fundAmount);

      expect(await credmarkAccessKey.cmkAmount(tokenId)).to.be.equal(
        fundAmount
      );
    });
  });

  describe('#mintSubscribeAndFund', () => {
    it('should mint, fund & subscribe', async () => {
      const fundAmount = BigNumber.from(1000);

      await cmk.connect(admin).transfer(wallet.address, fundAmount);

      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(BigNumber.from(2514)); // $0.2514

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
        BigNumber.from(100).mul(BigNumber.from(10).pow(18)),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTierAddress
      );
    });
  });

  describe('#debt', () => {
    it('should be in debt with time', async () => {
      const cmkPrice = BigNumber.from(2500); // $0.25
      const fundAmount = BigNumber.from(1000).mul(BigNumber.from(10).pow(18)); // 1000 CMK ~= $400

      await cmk.connect(admin).transfer(wallet.address, fundAmount.mul(2));

      await cmk.approve(credmarkAccessKey.address, fundAmount.mul(2));

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
        BigNumber.from(100).mul(BigNumber.from(10).pow(18)),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      // Token ID 0
      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTierAddress
      );

      // Token ID 1
      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTierAddress
      );

      const sevenDays = 7 * 24 * 60 * 60;

      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      // 100$ for 30 days, so for 7 days,
      // debt = 100$ * (7 days / 30 days) / (1 cmk per $)
      expect(
        (await credmarkAccessKey.debt(0)).div(BigNumber.from(10).pow(18))
      ).to.be.closeTo(
        BigNumber.from(100).mul(7).mul(10000).div(30).div(cmkPrice),
        1
      );

      expect(
        (await credmarkAccessKey.debt(1)).div(BigNumber.from(10).pow(18))
      ).to.be.closeTo(
        BigNumber.from(100).mul(7).mul(10000).div(30).div(cmkPrice),
        1
      );

      await credmarkAccessKey.resolveDebt(0);

      expect(await credmarkAccessKey.debt(0)).to.be.equal(0);

      expect(
        (await credmarkAccessKey.debt(1)).div(BigNumber.from(10).pow(18))
      ).to.be.closeTo(
        BigNumber.from(100).mul(7).mul(10000).div(30).div(cmkPrice),
        1
      );

      // Changing subscription tier fee to $200 per month
      const subscriptionTier = (await ethers.getContractAt(
        'CredmarkAccessKeySubscriptionTier',
        subscriptionTierAddress
      )) as CredmarkAccessKeySubscriptionTier;

      await subscriptionTier
        .connect(admin)
        .setMonthlyFeeUsd(BigNumber.from(200).mul(BigNumber.from(10).pow(18)));

      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      expect(
        (await credmarkAccessKey.debt(0)).div(BigNumber.from(10).pow(18))
      ).to.be.closeTo(
        BigNumber.from(200).mul(7).mul(10000).div(30).div(cmkPrice),
        1
      );

      expect(
        (await credmarkAccessKey.debt(1)).div(BigNumber.from(10).pow(18))
      ).to.be.closeTo(
        BigNumber.from(100)
          .mul(7)
          .mul(10000)
          .div(30)
          .div(cmkPrice)
          .add(BigNumber.from(200).mul(7).mul(10000).div(30).div(cmkPrice)),
        1
      );
    });
  });

  describe('#burn', () => {
    it('should burn', async () => {
      const tokenId = BigNumber.from(0);
      const cmkPrice = BigNumber.from(2500); // $0.25
      const fundAmount = BigNumber.from(1000).mul(BigNumber.from(10).pow(18)); // 1000 CMK ~= $400

      await cmk.connect(admin).transfer(wallet.address, fundAmount);

      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
        BigNumber.from(100).mul(BigNumber.from(10).pow(18)),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      // Token ID 0
      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTierAddress
      );

      const sevenDays = 7 * 24 * 60 * 60;

      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      // 100$ for 30 days, so for 7 days,
      // debt = 100$ * (7 days / 30 days) / (0.25 cmk per $) ~= 93 CMK
      expect(
        (await credmarkAccessKey.debt(tokenId)).div(BigNumber.from(10).pow(18))
      ).to.equal(BigNumber.from(93));

      expect(
        (await cmk.balanceOf(credmarkDao.address)).div(
          BigNumber.from(10).pow(18)
        )
      ).to.equal(0);
      expect(
        (await cmk.balanceOf(wallet.address)).div(BigNumber.from(10).pow(18))
      ).to.equal(0);

      await credmarkAccessKey.burn(tokenId);

      expect(
        (await credmarkAccessKey.cmkAmount(tokenId)).div(
          BigNumber.from(10).pow(18)
        )
      ).to.equal(0);

      expect(
        (await cmk.balanceOf(credmarkDao.address)).div(
          BigNumber.from(10).pow(18)
        )
      ).to.equal(93);
      expect(
        (await cmk.balanceOf(wallet.address)).div(BigNumber.from(10).pow(18))
      ).to.equal(906);
      await expect(
        credmarkAccessKey.tokenOfOwnerByIndex(wallet.address, tokenId)
      ).to.be.reverted;
    });

    it('should not burn for non-owner', async () => {
      const tokenId = BigNumber.from(0);
      const cmkPrice = BigNumber.from(2500); // $0.25
      const fundAmount = BigNumber.from(1000).mul(BigNumber.from(10).pow(18)); // 1000 CMK ~= $400

      await cmk.connect(admin).transfer(wallet.address, fundAmount);

      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
        BigNumber.from(100).mul(BigNumber.from(10).pow(18)),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTierAddress
      );

      await expect(
        credmarkAccessKey.connect(otherWallet).burn(tokenId)
      ).to.be.revertedWith('Approval required');
    });

    it('should not burn when debt exceeds balance', async () => {
      const tokenId = BigNumber.from(0);
      const cmkPrice = BigNumber.from(2500); // $0.25
      const fundAmount = BigNumber.from(10).mul(BigNumber.from(10).pow(18)); // 10 CMK ~= $4

      await cmk.connect(admin).transfer(wallet.address, fundAmount);

      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
        BigNumber.from(100).mul(BigNumber.from(10).pow(18)),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTierAddress
      );

      const sevenDays = 7 * 24 * 60 * 60;

      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      // 100$ for 30 days, so for 7 days,
      // debt = 100$ * (7 days / 30 days) / (0.25 cmk per $) ~= 93 CMK
      expect(
        (await credmarkAccessKey.debt(tokenId)).div(BigNumber.from(10).pow(18))
      ).to.equal(BigNumber.from(93));

      await expect(credmarkAccessKey.burn(tokenId)).to.be.revertedWith(
        'Access Key is not solvent'
      );
    });
  });

  describe('#liquidate', () => {
    it('should liquidate when debt exceeds balance', async () => {
      const tokenId = BigNumber.from(0);
      const cmkPrice = BigNumber.from(2500); // $0.25
      const fundAmount = BigNumber.from(10).mul(BigNumber.from(10).pow(18)); // 10 CMK ~= $4

      await cmk.connect(admin).transfer(wallet.address, fundAmount);

      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
        BigNumber.from(100).mul(BigNumber.from(10).pow(18)),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTierAddress
      );

      const sevenDays = 7 * 24 * 60 * 60;

      await ethers.provider.send('evm_increaseTime', [sevenDays]);
      await ethers.provider.send('evm_mine', []);

      await credmarkAccessKey.connect(otherWallet).liquidate(tokenId);

      expect(await credmarkAccessKey.cmkAmount(tokenId)).to.equal(0);
      expect(await cmk.balanceOf(wallet.address)).to.equal(0);
      expect(await cmk.balanceOf(credmarkDao.address)).to.equal(fundAmount);
    });

    it('should not liquidate when debt is less than balance', async () => {
      const tokenId = BigNumber.from(0);
      const cmkPrice = BigNumber.from(2500); // $0.25
      const fundAmount = BigNumber.from(10).mul(BigNumber.from(10).pow(18)); // 10 CMK ~= $4

      await cmk.connect(admin).transfer(wallet.address, fundAmount);

      await cmk.approve(credmarkAccessKey.address, fundAmount);

      const oracleFactory = await ethers.getContractFactory(
        'CredmarkPriceOracleUsd'
      );
      const oracle = (await oracleFactory.deploy()) as CredmarkPriceOracleUsd;
      await oracle.updateOracle(cmkPrice); // $0.25

      await credmarkAccessKey.connect(admin).createSubscriptionTier(
        admin.address,
        oracle.address,
        BigNumber.from(100).mul(BigNumber.from(10).pow(18)),
        3600, // 1hour
        true
      );

      const subscriptionTierAddress = await credmarkAccessKey.supportedTiers(0);

      await credmarkAccessKey.mintSubscribeAndFund(
        fundAmount,
        subscriptionTierAddress
      );

      await expect(credmarkAccessKey.liquidate(tokenId)).to.be.revertedWith(
        'Access Key is solvent'
      );

      await expect(
        credmarkAccessKey.connect(otherWallet).liquidate(tokenId)
      ).to.be.revertedWith('Access Key is solvent');
    });
  });
});
