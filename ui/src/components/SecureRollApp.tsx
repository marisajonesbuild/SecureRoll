import { useCallback, useMemo, useState } from 'react';
import { useAccount, useChainId } from 'wagmi';
import { Contract, ethers } from 'ethers';

import { useEthersSigner } from '../hooks/useEthersSigner';
import { useZamaInstance } from '../hooks/useZamaInstance';
import { Header } from './Header';
import { publicClient } from '../config/viem';
import { SECURE_ROLL_ABI, resolveSecureRollAddress } from '../config/contracts';
import '../styles/SecureRollApp.css';

const SEPOLIA_CHAIN_ID = 11155111;

function isBytes32(value: unknown): value is `0x${string}` {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function SecureRollApp() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const signerPromise = useEthersSigner();
  const { instance, isLoading: zamaLoading, error: zamaError } = useZamaInstance();

  const contractAddress = useMemo(() => resolveSecureRollAddress(), []);

  const [buyEthAmount, setBuyEthAmount] = useState('1');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [encryptedPoints, setEncryptedPoints] = useState<string | null>(null);
  const [clearPoints, setClearPoints] = useState<bigint | null>(null);

  const [activeRound, setActiveRound] = useState<boolean | null>(null);
  const [encryptedDice, setEncryptedDice] = useState<string | null>(null);
  const [clearDice, setClearDice] = useState<bigint | null>(null);

  const [encryptedReward, setEncryptedReward] = useState<string | null>(null);
  const [clearReward, setClearReward] = useState<bigint | null>(null);

  const canInteract = isConnected && address && chainId === SEPOLIA_CHAIN_ID && contractAddress;

  const readState = useCallback(async () => {
    setError(null);
    setClearPoints(null);
    setClearDice(null);
    setClearReward(null);

    if (!address || !contractAddress) return;

    const [pointsHandle, hasRound, diceHandle, rewardHandle] = await Promise.all([
      publicClient.readContract({
        address: contractAddress,
        abi: SECURE_ROLL_ABI,
        functionName: 'getEncryptedPoints',
        args: [address],
      }),
      publicClient.readContract({
        address: contractAddress,
        abi: SECURE_ROLL_ABI,
        functionName: 'hasActiveRound',
        args: [address],
      }),
      publicClient.readContract({
        address: contractAddress,
        abi: SECURE_ROLL_ABI,
        functionName: 'getLastEncryptedDice',
        args: [address],
      }),
      publicClient.readContract({
        address: contractAddress,
        abi: SECURE_ROLL_ABI,
        functionName: 'getLastEncryptedReward',
        args: [address],
      }),
    ]);

    setEncryptedPoints(isBytes32(pointsHandle) ? pointsHandle : null);
    setActiveRound(typeof hasRound === 'boolean' ? hasRound : null);
    setEncryptedDice(isBytes32(diceHandle) ? diceHandle : null);
    setEncryptedReward(isBytes32(rewardHandle) ? rewardHandle : null);
  }, [address, contractAddress]);

  const userDecrypt = useCallback(
    async (handle: string) => {
      if (!instance) throw new Error('Encryption service not ready');
      if (!signerPromise) throw new Error('Wallet signer not ready');
      if (!contractAddress) throw new Error('Missing contract address');

      const signer = await signerPromise;
      const signerAddress = await signer.getAddress();

      const keypair = instance.generateKeypair();
      const handleContractPairs = [{ handle, contractAddress }];
      const startTimeStamp = Math.floor(Date.now() / 1000).toString();
      const durationDays = '1';
      const contractAddresses = [contractAddress];

      const eip712 = instance.createEIP712(keypair.publicKey, contractAddresses, startTimeStamp, durationDays);
      const signature = await signer.signTypedData(
        eip712.domain,
        { UserDecryptRequestVerification: eip712.types.UserDecryptRequestVerification },
        eip712.message,
      );

      const result = await instance.userDecrypt(
        handleContractPairs,
        keypair.privateKey,
        keypair.publicKey,
        signature.replace('0x', ''),
        contractAddresses,
        signerAddress,
        startTimeStamp,
        durationDays,
      );

      return result[handle];
    },
    [instance, signerPromise, contractAddress],
  );

  const decryptPoints = useCallback(async () => {
    setError(null);
    if (!encryptedPoints) return;
    if (encryptedPoints === ethers.ZeroHash) {
      setClearPoints(0n);
      return;
    }
    setBusy('Decrypting points...');
    try {
      const value = await userDecrypt(encryptedPoints);
      setClearPoints(BigInt(value));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to decrypt points');
    } finally {
      setBusy(null);
    }
  }, [encryptedPoints, userDecrypt]);

  const decryptDice = useCallback(async () => {
    setError(null);
    if (!encryptedDice) return;
    if (encryptedDice === ethers.ZeroHash) {
      setClearDice(0n);
      return;
    }
    setBusy('Decrypting dice...');
    try {
      const value = await userDecrypt(encryptedDice);
      setClearDice(BigInt(value));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to decrypt dice');
    } finally {
      setBusy(null);
    }
  }, [encryptedDice, userDecrypt]);

  const decryptReward = useCallback(async () => {
    setError(null);
    if (!encryptedReward) return;
    if (encryptedReward === ethers.ZeroHash) {
      setClearReward(0n);
      return;
    }
    setBusy('Decrypting reward...');
    try {
      const value = await userDecrypt(encryptedReward);
      setClearReward(BigInt(value));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to decrypt reward');
    } finally {
      setBusy(null);
    }
  }, [encryptedReward, userDecrypt]);

  const buyPoints = useCallback(async () => {
    setError(null);
    if (!canInteract || !signerPromise) return;
    setBusy('Buying points...');
    try {
      const signer = await signerPromise;
      const contract = new Contract(contractAddress, SECURE_ROLL_ABI, signer);
      const value = ethers.parseEther(buyEthAmount);
      const tx = await contract.buyPoints({ value });
      await tx.wait();
      await readState();
      setClearPoints(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to buy points');
    } finally {
      setBusy(null);
    }
  }, [buyEthAmount, canInteract, signerPromise, contractAddress, readState]);

  const startGame = useCallback(async () => {
    setError(null);
    if (!canInteract || !signerPromise) return;
    setBusy('Starting game...');
    try {
      const signer = await signerPromise;
      const contract = new Contract(contractAddress, SECURE_ROLL_ABI, signer);
      const tx = await contract.startGame();
      await tx.wait();
      await readState();
      setClearDice(null);
      setClearReward(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start game');
    } finally {
      setBusy(null);
    }
  }, [canInteract, signerPromise, contractAddress, readState]);

  const submitGuess = useCallback(
    async (guess: 1 | 2) => {
      setError(null);
      if (!canInteract || !instance || !signerPromise || !address) return;
      setBusy(guess === 1 ? 'Submitting guess (big)...' : 'Submitting guess (small)...');

      try {
        const signer = await signerPromise;
        const contract = new Contract(contractAddress, SECURE_ROLL_ABI, signer);

        const input = instance.createEncryptedInput(contractAddress, address);
        input.add8(guess);
        const encryptedInput = await input.encrypt();

        const tx = await contract.submitGuess(encryptedInput.handles[0], encryptedInput.inputProof);
        await tx.wait();
        await readState();
        setClearReward(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to submit guess');
      } finally {
        setBusy(null);
      }
    },
    [canInteract, instance, signerPromise, address, contractAddress, readState],
  );

  return (
    <div className="app-shell">
      <Header />

      <main className="main">
        <section className="card">
          <h2 className="card-title">Contract</h2>
          <div className="row">
            <div className="label">Network</div>
            <div className="value">Sepolia ({SEPOLIA_CHAIN_ID})</div>
          </div>
          <div className="row">
            <div className="label">Address</div>
            <div className="value mono">
              {contractAddress ?? 'Missing. Open the app with ?contract=0xYourDeployedAddress'}
            </div>
          </div>
          <div className="row actions">
            <button className="button" onClick={readState} disabled={!address || !contractAddress || !!busy}>
              Refresh
            </button>
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Points</h2>
          <div className="row">
            <div className="label">Encrypted</div>
            <div className="value mono">{encryptedPoints ?? '-'}</div>
          </div>
          <div className="row">
            <div className="label">Decrypted</div>
            <div className="value">{clearPoints === null ? '-' : clearPoints.toString()}</div>
          </div>
          <div className="row actions">
            <button className="button" onClick={decryptPoints} disabled={!encryptedPoints || !canInteract || !!busy}>
              Decrypt Points
            </button>
          </div>
          <div className="divider" />
          <div className="row">
            <div className="label">Buy (ETH)</div>
            <input
              className="input"
              inputMode="decimal"
              value={buyEthAmount}
              onChange={(e) => setBuyEthAmount(e.target.value)}
              placeholder="1"
              disabled={!canInteract || !!busy}
            />
          </div>
          <div className="row actions">
            <button className="button primary" onClick={buyPoints} disabled={!canInteract || !!busy}>
              Buy Points
            </button>
          </div>
        </section>

        <section className="card">
          <h2 className="card-title">Game</h2>
          <div className="row">
            <div className="label">Active round</div>
            <div className="value">{activeRound === null ? '-' : activeRound ? 'Yes' : 'No'}</div>
          </div>
          <div className="row">
            <div className="label">Encrypted dice</div>
            <div className="value mono">{encryptedDice ?? '-'}</div>
          </div>
          <div className="row">
            <div className="label">Decrypted dice</div>
            <div className="value">{clearDice === null ? '-' : clearDice.toString()}</div>
          </div>
          <div className="row actions">
            <button className="button primary" onClick={startGame} disabled={!canInteract || !!busy}>
              Start Game (roll dice)
            </button>
            <button className="button" onClick={decryptDice} disabled={!encryptedDice || !canInteract || !!busy}>
              Decrypt Dice
            </button>
          </div>
          <div className="divider" />
          <div className="row actions">
            <button
              className="button primary"
              onClick={() => submitGuess(1)}
              disabled={!canInteract || !!busy || !activeRound}
            >
              Guess Big (4-6)
            </button>
            <button
              className="button primary"
              onClick={() => submitGuess(2)}
              disabled={!canInteract || !!busy || !activeRound}
            >
              Guess Small (1-3)
            </button>
          </div>
          <div className="divider" />
          <div className="row">
            <div className="label">Encrypted reward</div>
            <div className="value mono">{encryptedReward ?? '-'}</div>
          </div>
          <div className="row">
            <div className="label">Decrypted reward</div>
            <div className="value">{clearReward === null ? '-' : clearReward.toString()}</div>
          </div>
          <div className="row actions">
            <button className="button" onClick={decryptReward} disabled={!encryptedReward || !canInteract || !!busy}>
              Decrypt Reward
            </button>
          </div>
        </section>

        <section className="card subtle">
          <div className="note">
            {!isConnected && <div>Connect your wallet to play.</div>}
            {isConnected && chainId !== SEPOLIA_CHAIN_ID && (
              <div>Please switch your wallet network to Sepolia.</div>
            )}
            {zamaLoading && <div>Initializing encryption service...</div>}
            {zamaError && <div className="error">Encryption error: {zamaError}</div>}
            {busy && <div className="info">{busy}</div>}
            {error && <div className="error">{error}</div>}
          </div>
        </section>
      </main>
    </div>
  );
}

