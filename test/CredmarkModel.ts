import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { BigNumber } from 'ethers';
import { joinSignature } from 'ethers/lib/utils';
import { ethers, waffle } from 'hardhat';
import { ReadableStreamBYOBRequest } from 'stream/web';
import { CredmarkModel } from '../typechain';

describe('Credmark Model', () => {
    let credmarkModel: CredmarkModel;
    let deployer: SignerWithAddress;
    let alice: SignerWithAddress;
    let bob: SignerWithAddress;

    const fixture = async () => {
        const credmarkModelFactory = await ethers.getContractFactory('CredmarkModel');
        return (await credmarkModelFactory.deploy()) as CredmarkModel;
    }

    beforeEach(async () => {
        credmarkModel = await waffle.loadFixture(fixture);
        [deployer, alice, bob] = await ethers.getSigners();

    });

    it('is constructed correctly', async () => {
        expect(await credmarkModel.name()).to.equal('CredmarkModel');
        expect(await credmarkModel.symbol()).to.equal('CMKm');
    })

    describe('pause and unpause', () => {
        it('must be done by deployer', async () => {
            //pause by deployer
            await credmarkModel.connect(deployer).pause();
            expect(await credmarkModel.paused()).to.equal(true);
            
            //unpuase by deployer

            await credmarkModel.connect(deployer).unpause();
            expect(await credmarkModel.paused()).to.equal(false);

        });
    });

    describe('mint', () => {
        const TEST_SLUG = "test";
        
        it('must be done by MINTER_ROLE', async () => {
            await expect(credmarkModel.connect(alice).safeMint(alice.address, TEST_SLUG)).to.reverted;
        })

        it('Cant not mint again using same slug', async () => {
            await credmarkModel.connect(deployer).safeMint(alice.address, TEST_SLUG);           
            
            await expect(credmarkModel.connect(deployer).safeMint(bob.address, TEST_SLUG)).to.be.revertedWith(
                'Slug already Exists'
            );
        })
    })

}) 