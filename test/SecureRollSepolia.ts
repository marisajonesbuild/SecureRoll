import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { ethers, fhevm, deployments } from "hardhat";
import { expect } from "chai";
import { FhevmType } from "@fhevm/hardhat-plugin";
import { SecureRoll } from "../types";

type Signers = {
  alice: HardhatEthersSigner;
};

describe("SecureRollSepolia", function () {
  let signers: Signers;
  let secureRoll: SecureRoll;
  let secureRollAddress: string;
  let step: number;
  let steps: number;

  function progress(message: string) {
    console.log(`${++step}/${steps} ${message}`);
  }

  before(async function () {
    if (fhevm.isMock) {
      console.warn(`This hardhat test suite can only run on Sepolia Testnet`);
      this.skip();
    }

    try {
      const deployment = await deployments.get("SecureRoll");
      secureRollAddress = deployment.address;
      secureRoll = await ethers.getContractAt("SecureRoll", deployment.address);
    } catch (e) {
      (e as Error).message += ". Call 'npx hardhat deploy --network sepolia'";
      throw e;
    }

    const ethSigners = await ethers.getSigners();
    signers = { alice: ethSigners[0] };
  });

  beforeEach(async () => {
    step = 0;
    steps = 0;
  });

  it("starts a round and rewards a correct guess", async function () {
    steps = 10;
    this.timeout(6 * 40000);

    progress(`Call SecureRoll.startGame() contract=${secureRollAddress} signer=${signers.alice.address}...`);
    let tx = await secureRoll.connect(signers.alice).startGame();
    await tx.wait();

    progress(`Call SecureRoll.getLastEncryptedDice(player)...`);
    const encryptedDice = await secureRoll.getLastEncryptedDice(signers.alice.address);
    expect(encryptedDice).to.not.eq(ethers.ZeroHash);

    progress(`Decrypt dice handle=${encryptedDice}...`);
    const clearDice = await fhevm.userDecryptEuint(
      FhevmType.euint8,
      encryptedDice,
      secureRollAddress,
      signers.alice,
    );
    progress(`Dice=${clearDice}`);

    const correctGuess = clearDice > 3n ? 1 : 2;

    progress(`Encrypt guess=${correctGuess}...`);
    const encryptedGuess = await fhevm
      .createEncryptedInput(secureRollAddress, signers.alice.address)
      .add8(correctGuess)
      .encrypt();

    progress(`Call SecureRoll.submitGuess(...)...`);
    tx = await secureRoll.connect(signers.alice).submitGuess(encryptedGuess.handles[0], encryptedGuess.inputProof);
    await tx.wait();

    progress(`Decrypt last reward...`);
    const encryptedReward = await secureRoll.getLastEncryptedReward(signers.alice.address);
    const clearReward = await fhevm.userDecryptEuint(
      FhevmType.euint64,
      encryptedReward,
      secureRollAddress,
      signers.alice,
    );
    progress(`Reward=${clearReward}`);
    expect(clearReward).to.eq(10000);
  });
});

