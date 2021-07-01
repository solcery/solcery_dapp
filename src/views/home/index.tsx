import { Button, Col, Row } from "antd";
import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { ConnectButton } from "../../components/ConnectButton";
import { TokenIcon } from "../../components/TokenIcon";
import { useConnectionConfig, sendTransaction, useConnection } from "../../contexts/connection";
import { useMarkets } from "../../contexts/market";
import { useUserBalance, useUserTotalBalance } from "../../hooks";
import { WRAPPED_SOL_MINT } from "../../utils/ids";
import { formatUSD } from "../../utils/utils";
import { notify } from "../../utils/notifications";
import { useWallet, WalletAdapter } from "../../contexts/wallet";
import { Account, Connection, Transaction, TransactionInstruction, TransactionCtorFields, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
import { createUninitializedMint, createTokenAccount } from "../../actions/account"
import Unity, { UnityContext } from "react-unity-webgl";
import { AccountLayout, MintLayout, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { SystemProgram, TransferParams } from "@solana/web3.js";
import Cookies from 'universal-cookie';

import bs58 from 'bs58';

export function set_unity_wallet_connected(isConnected: boolean) {
  console.log('home connected');
  var data = { IsConnected: isConnected };
  unityContext.send("ReactToUnity", "SetWalletConnected", JSON.stringify(data));
}

export function set_unity_card_creation_signed(cardName: string, isSigned: boolean) {
  var data = { CardName: cardName, IsSigned: isSigned };
  unityContext.send("ReactToUnity", "SetCardCreationSigned", JSON.stringify(data));
}

export function set_unity_card_creation_confirmed(cardName: string, isConfirmed: boolean) {
  var data = { CardName: cardName, IsConfirmed: isConfirmed };
  unityContext.send("ReactToUnity", "SetCardCreationConfirmed", JSON.stringify(data));
}

const joinedBufferToBuffer = function (joinedBuffer: string) {
  var strBytesArray = joinedBuffer.split('|');
  var buf = Buffer.allocUnsafe(strBytesArray.length + 1);
  buf.writeInt8(0);
  for (var i = 0; i < strBytesArray.length; i++) {
    buf.writeInt8(parseInt(strBytesArray[i]), i + 1);
  }
  console.log(buf)
  return buf
}

const unityContext = new UnityContext({
  loaderUrl: "unity_build/brickconfigs_fix.loader.js",
  dataUrl: "unity_build/brickconfigs_fix.data",
  frameworkUrl: "unity_build/brickconfigs_fix.framework.js",
  codeUrl: "unity_build/brickconfigs_fix.wasm",
  streamingAssetsUrl: "StreamingAssets"
});

export const HomeView = () => {
  var boardCollection : { [id: string] : Object; } = {};

  const buildRulesetFromCookies = () => {
    var cookies = new Cookies();
    var boardName = cookies.get("boardName") 
    var name = 'board.' + boardName;
    var deck = [] 
    var init = []
    var deckSize = parseInt(cookies.get(name + '.deck.size'))
    for (let i = 0; i < deckSize; i++) {
      deck.push({
        key: new PublicKey(cookies.get(name + '.deck.' + i + '.key')),
        amount: parseInt(cookies.get(name + '.deck.' + i + '.amount')),
        place: parseInt(cookies.get(name + '.deck.' + i + '.place')),
      })
    }
    var initSize = parseInt(cookies.get(name + '.init.size'))
    for (let i = 0; i < initSize; i++) {
      init.push(parseInt(cookies.get(name + '.init.' + i)))
    }
    return {
      deck: deck,
      init: init,
    }
  }

  const getCardClientMetaData = (clientMetadata: Buffer) => {
    if (clientMetadata.length <= 0) {
      return {
        Picture: 1,
        Name: "Error",
        Description: "Error",
      }
    }
    var pos = 4
    var picture = clientMetadata.readUInt32LE(pos);
    pos += 4;
    var nameLength = clientMetadata.readUInt32LE(pos);
    pos += 4;
    var name = clientMetadata.toString('utf8', pos, pos + nameLength);
    pos += nameLength;
    var descriptionLength = clientMetadata.readUInt32LE(pos);
    pos += 4;
    var description = clientMetadata.toString('utf8', pos, pos + descriptionLength);
    return {
      Picture: picture,
      Name: name,
      Description: description,
    }
  }

  const updateBoard = async () => {
    var cookies = new Cookies();
    var boardAccountKey = cookies.get('boardAccountKey');
    if (boardAccountKey) {
      var accInfo = await connection.getAccountInfo(new PublicKey(boardAccountKey));
        if (accInfo?.data) {
          var buf = Buffer.from(accInfo?.data);
          var boardData = await serializeBoardData(buf);
          console.log("UpdateBoard")
          console.log(JSON.stringify(boardData))
          unityContext.send("ReactToUnity", "UpdateBoard", JSON.stringify(boardData));            
        }
      }
  }

  const serializeBoardData = async (buf: Buffer) => {
    if (wallet?.publicKey) {
      var playersArray = [];
      var cardsArray = [];
      var cardTypes = [];
      var players = buf.readUInt32LE(0);
      var pos = 4;
      for (let i = 0; i < players; i++) {
        var playerKey = new PublicKey(buf.subarray(pos, pos + 32));
        pos += 32;
        var isActive = Boolean(buf.readInt32LE(pos));
        pos += 4;
        var hp = buf.readInt32LE(pos);
        pos += 4;
        var coins = buf.readUInt32LE(pos);
        pos += 4;
        var playerData = {
          Address: playerKey.toBase58(),
          IsActive: isActive,
          HP: hp,
          Coins: coins,
          IsMe: playerKey.toBase58() == wallet.publicKey.toBase58(),
        }
        playersArray.push(playerData)
      }
      var cardTypesAmount = buf.readUInt32LE(pos)
      pos += 4;
      for (let i = 0; i < cardTypesAmount; i++) {
        var id = buf.readUInt32LE(pos)
        pos += 4;
        var cardTypeKey = new PublicKey(buf.subarray(pos, pos + 32)).toBase58();
        pos += 32;
        var cardDataSize = buf.readUInt32LE(pos)
        pos += 4;
        var cardType = {
          Id: id,
          MintAddress: cardTypeKey,
          Metadata: getCardClientMetaData(buf.slice(pos, pos + cardDataSize))
        }
        cardTypes.push(cardType);
        pos += cardDataSize;
      }

      var cards = buf.readUInt32LE(pos)
      //console.log('cards: ', cards)
      pos += 4;
      for (let i = 0; i < cards; i++) {
        var id = buf.readInt32LE(pos)
        pos += 4;
        var cardTypeIndex = buf.readInt32LE(pos)
        pos += 4;
        var place = buf.readUInt8(pos)
        pos += 1;
        var card = {
          CardId: id,
          CardType: cardTypeIndex,
          MintAddress: cardTypes[cardTypeIndex].MintAddress,
          CardPlace: place,
          Metadata: cardTypes[cardTypeIndex].Metadata,
        }
        //console.log("card: ", card)
        cardsArray.push(card);
      }
      return {
        Players: playersArray,
        Cards: cardsArray,
        EndTurnCardId: 0,
      }
    }
  }

  const createBoard = async () => {
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) { 
        var boardAccount = new Account()
        var accounts: Account[];
        accounts = []
        var createBoardAccountIx = SystemProgram.createAccount({
          programId: programId,
          space: 23530,
          lamports: await connection.getMinimumBalanceForRentExemption(23530, 'singleGossip'),
          fromPubkey: wallet.publicKey,
          newAccountPubkey: boardAccount.publicKey,
        });

        accounts.push(boardAccount);
        var instructions = [createBoardAccountIx];
        var keys = [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: boardAccount.publicKey, isSigner: false, isWritable: true },
        ]

        var ruleset = buildRulesetFromCookies();
        var rulesetDeckLength = ruleset.deck.length
        var bufferSize = 1 + 4 + rulesetDeckLength * 5 + 4 + ruleset.init.length * 4
        var buf = Buffer.allocUnsafe(bufferSize);
        var pos = 0;
        buf.writeInt8(1, 0); // instruction = createBoard
        pos += 1;
        buf.writeUInt32LE(ruleset.deck.length, pos);
        pos += 4;
        for (let i = 0; i < ruleset.deck.length; i++) {
          buf.writeUInt32LE(ruleset.deck[i].amount, pos)
          pos += 4;
          buf.writeUInt32LE(ruleset.deck[i].place, pos)
          pos += 1;
          keys.push({ pubkey: ruleset.deck[i].key, isSigner: false, isWritable: false })
        }
        buf.writeUInt32LE(ruleset.init.length, pos);
        pos += 4;
        for (let i = 0; i < ruleset.init.length; i++) {
          buf.writeUInt32LE(ruleset.init[i], pos)
          pos += 4
        }
        console.log('Sending buffer', buf);

        const createBoardIx = new TransactionInstruction({
          keys: keys,
          programId,
          data: buf,
        });
        instructions.push(createBoardIx);
        var buf = Buffer.allocUnsafe(1);
        buf.writeInt8(2, 0); // instruction = joinBoard
        const joinBoardIx = new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
            { pubkey: boardAccount.publicKey, isSigner: false, isWritable: true },
          ],
          programId,
          data: buf,
        });
        instructions.push(joinBoardIx);
        sendTransaction(connection, wallet, instructions, accounts).then( async () => {
          notify({
            message: "Board started",
            description: "Started board " + boardAccount.publicKey,
          });
          var cookies = new Cookies();
          cookies.set('boardAccountKey', boardAccount.publicKey.toBase58());
          await updateBoard();
          connection.onAccountChange(boardAccount.publicKey, updateBoard)
        },
        () => notify({
          message: "Board create failed",
          description: "Some error",
        }));
      }
    }
  }

  const joinBoard = async (boardAccountKey: string) => {
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) {
        var accounts: Account[];
        accounts = []
      
        var instructions = [];
        var keyBufRaw = Buffer.from(boardAccountKey, 'ascii');
        var newBuf = keyBufRaw.slice(0, 44);
        var boardAccountPublicKey = new PublicKey(newBuf.toString('utf8'));

        var buf = Buffer.allocUnsafe(1);
        buf.writeInt8(2, 0); // instruction = joinBoard
        const joinBoardIx = new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
            { pubkey: boardAccountPublicKey, isSigner: false, isWritable: true },
          ],
          programId,
          data: buf,
        });
        instructions.push(joinBoardIx);
        sendTransaction(connection, wallet, instructions, accounts).then(() => {
          notify({
            message: "Board started",
            description: "Started board " + boardAccountPublicKey,
          });
          var cookies = new Cookies();
          cookies.set('boardAccountKey', boardAccountPublicKey.toBase58());
          updateBoard();
          connection.onAccountChange(boardAccountPublicKey, updateBoard)
        },
        () => notify({
          message: "Board join failed",
          description: "Some error",
        }));
      }
    }
  };
  unityContext.on("CreateBoard", createBoard);
  unityContext.on("JoinBoard", (boardAccountKey) => joinBoard(boardAccountKey));

  //6ZHQiVNNHj7QbRaDobP4R5FYsTCFL5hxxNc7eqmNhioA

  const createCard = async (cardData: string, cardName: string) => {
    var accounts: Account[];
    accounts = [];
    var buf = joinedBufferToBuffer(cardData);
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) {
        var cardAccount = new Account()
        var instructions = []
        var createCardAccountIx = SystemProgram.createAccount({
          programId: programId,
          space: buf.length - 1,
          lamports: await connection.getMinimumBalanceForRentExemption(buf.length - 1, 'singleGossip'),
          fromPubkey: wallet.publicKey,
          newAccountPubkey: cardAccount.publicKey,
        });
        accounts.push(cardAccount);
        instructions.push(createCardAccountIx); // Mb we want this one to be in rust code?    

        const saveMetadataIx = new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
            { pubkey: cardAccount.publicKey, isSigner: false, isWritable: true },
          ],
          programId,
          data: buf,
        });
        instructions.push(saveMetadataIx);
        await sendTransaction(connection, wallet, instructions, accounts, true,
          () => set_unity_card_creation_signed(cardName, true),
          () => set_unity_card_creation_signed(cardName, false)
        ).then(async () => {
          set_unity_card_creation_confirmed(cardName, true);
          notify({
            message: "Card created",
            description: "Created card " + cardAccount.publicKey.toBase58(),
          });
          let cardClientMetadataSize = buf.readUInt32LE(1);
        },
        () => set_unity_card_creation_confirmed(cardName, false));
      }
    }
  };
  unityContext.on("CreateCard", createCard);


  var connection = useConnection();
  const { marketEmitter, midPriceInUSD } = useMarkets();
  const { tokenMap } = useConnectionConfig();
  const SRM_ADDRESS = 'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt';
  const SRM = useUserBalance(SRM_ADDRESS);
  const SOL = useUserBalance(WRAPPED_SOL_MINT);
  const { balanceInUSD: totalBalanceInUSD } = useUserTotalBalance();
  const { wallet, connected, connect, select, provider } = useWallet();
  var connection = useConnection();

  var programId = new PublicKey("A1U9yQfGgNMn2tkE5HB576QYoBA3uAdNFdjJA439S4m6");

  unityContext.on("LogToConsole", (message) => {
    console.log(message);
  });

  unityContext.on("OnUnityLoaded", () => {
    updateBoard();
    var data = { IsConnected: connected };
    unityContext.send("ReactToUnity", "SetWalletConnected", JSON.stringify(data));
  });

  unityContext.on("OpenLinkInNewTab", (link: string) => {
    window.open(link, "_blank")
  });



  unityContext.on("UseCard", (cardAccountKey, cardId) => {
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) {
        const cookies = new Cookies();
        var boardAccountStringKey = cookies.get('boardAccountKey');
        if (boardAccountStringKey) {
          var accounts: Account[];
          accounts = []
          var cardPubkey = new PublicKey(cardAccountKey);
          var boardAccountPubkey = new PublicKey(boardAccountStringKey);
          var buf = Buffer.allocUnsafe(5);
          buf.writeInt8(3, 0); // instruction = cast
          buf.writeUInt32LE(cardId, 1);
          console.log('Sending buffer', buf);
          const castIx = new TransactionInstruction({
            keys: [
              { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
              { pubkey: boardAccountPubkey, isSigner: false, isWritable: true },
            ],
            programId,
            data: buf,
          });
          var instructions = [castIx];
          sendTransaction(connection, wallet, instructions, accounts).then(async () => {
            notify({
              message: "Card casted",
              description: "Casted card " + cardPubkey,
            });
            updateBoard();
          },
          () => notify({
            message: "Cast card failed",
            description: "reason",
          }));
        }
      }
    }
  });

  useEffect(() => {
    const refreshTotal = () => { };

    const dispose = marketEmitter.onMarket(() => {
      refreshTotal();
    });

    refreshTotal();

    return () => {
      dispose();
    };
  }, [marketEmitter, midPriceInUSD, tokenMap]);

  return (
    <Unity tabIndex={3} style={{ width: '100%', height: '100%' }} unityContext={unityContext} />
    // <Row>
    //   <Button onClick={connected ? createBoard : createBoard} >
    //     create board
    //   </Button>

    //   <Button onClick={connected ? createCard : createCard} >
    //     create card
    //   </Button>
    // </Row>
  );
};
