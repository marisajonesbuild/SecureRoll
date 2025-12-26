// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {FHE, ebool, euint8, euint64, externalEuint8} from "@fhevm/solidity/lib/FHE.sol";
import {ZamaEthereumConfig} from "@fhevm/solidity/config/ZamaConfig.sol";

/// @title SecureRoll
/// @notice A dice game using FHE-encrypted points and guesses.
contract SecureRoll is ZamaEthereumConfig {
    uint64 public constant POINTS_PER_ETH = 100_000;
    uint64 public constant WIN_REWARD = 10_000;

    mapping(address => euint64) private _points;
    mapping(address => euint8) private _lastDice;
    mapping(address => ebool) private _lastWin;
    mapping(address => euint64) private _lastReward;
    mapping(address => bool) private _hasActiveRound;

    event PointsPurchased(address indexed player, uint256 weiAmount, uint64 points);
    event GameStarted(address indexed player, euint8 diceHandle);
    event GuessSubmitted(address indexed player, euint64 rewardHandle);

    function quotePoints(uint256 weiAmount) public pure returns (uint64) {
        return uint64((weiAmount * POINTS_PER_ETH) / 1 ether);
    }

    function buyPoints() external payable {
        uint64 pointsToAdd = quotePoints(msg.value);
        require(pointsToAdd > 0, "Insufficient ETH");

        euint64 encryptedToAdd = FHE.asEuint64(pointsToAdd);
        _points[msg.sender] = FHE.add(_points[msg.sender], encryptedToAdd);

        FHE.allowThis(_points[msg.sender]);
        FHE.allow(_points[msg.sender], msg.sender);

        emit PointsPurchased(msg.sender, msg.value, pointsToAdd);
    }

    function startGame() external {
        require(!_hasActiveRound[msg.sender], "Active round exists");

        euint8 roll0to255 = FHE.randEuint8();
        euint8 roll0to5 = FHE.rem(roll0to255, 6);
        euint8 dice = FHE.add(roll0to5, 1);

        _lastDice[msg.sender] = dice;
        _hasActiveRound[msg.sender] = true;

        FHE.allowThis(_lastDice[msg.sender]);
        FHE.allow(_lastDice[msg.sender], msg.sender);

        emit GameStarted(msg.sender, _lastDice[msg.sender]);
    }

    function submitGuess(externalEuint8 encryptedGuess, bytes calldata inputProof) external {
        require(_hasActiveRound[msg.sender], "No active round");

        euint8 guess = FHE.fromExternal(encryptedGuess, inputProof);
        euint8 dice = _lastDice[msg.sender];

        ebool diceIsBig = FHE.gt(dice, FHE.asEuint8(3));
        euint8 expected = FHE.select(diceIsBig, FHE.asEuint8(1), FHE.asEuint8(2));
        ebool win = FHE.eq(guess, expected);

        euint64 reward = FHE.select(win, FHE.asEuint64(WIN_REWARD), FHE.asEuint64(0));
        _points[msg.sender] = FHE.add(_points[msg.sender], reward);

        _lastWin[msg.sender] = win;
        _lastReward[msg.sender] = reward;
        _hasActiveRound[msg.sender] = false;

        FHE.allowThis(_points[msg.sender]);
        FHE.allow(_points[msg.sender], msg.sender);

        FHE.allowThis(_lastWin[msg.sender]);
        FHE.allow(_lastWin[msg.sender], msg.sender);

        FHE.allowThis(_lastReward[msg.sender]);
        FHE.allow(_lastReward[msg.sender], msg.sender);

        emit GuessSubmitted(msg.sender, _lastReward[msg.sender]);
    }

    function hasActiveRound(address player) external view returns (bool) {
        return _hasActiveRound[player];
    }

    function getEncryptedPoints(address player) external view returns (euint64) {
        return _points[player];
    }

    function getLastEncryptedDice(address player) external view returns (euint8) {
        return _lastDice[player];
    }

    function getLastEncryptedWin(address player) external view returns (ebool) {
        return _lastWin[player];
    }

    function getLastEncryptedReward(address player) external view returns (euint64) {
        return _lastReward[player];
    }
}
