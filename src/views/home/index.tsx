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
  loaderUrl: "unity_build/32.loader.js",
  dataUrl: "unity_build/32.data",
  frameworkUrl: "unity_build/32.framework.js",
  codeUrl: "unity_build/32.wasm",
  streamingAssetsUrl: "StreamingAssets"
});

export const HomeView = () => {
  var boardCollection : { [id: string] : Object; } = {};

  const updateCollection = function () {
    var cardsArray = [];
    const cookies = new Cookies();
    var cardsAmountCookie = cookies.get('cardsAmount');
    var cardsAmount = parseInt(cardsAmountCookie);
    cardsAmount = cardsAmount || 0;
    for (let i = 0; i < cardsAmount; i++) {
      cardsArray.push({
        MintAddress: cookies.get('cards[' + i + '][key]'),
        Metadata: {
          Picture: parseInt(cookies.get('cards[' + i + '][picture]')),
          Name: cookies.get('cards[' + i + '][name]'),
          Description: cookies.get('cards[' + i + '][description]'),
        }
      });
    }
    unityContext.send("ReactToUnity", "UpdateCollection", JSON.stringify({ Cards: cardsArray }));
  }

  const getCardClientMetaData = async (pubkey: string) => {
    var cardInfo = await connection.getAccountInfo(new PublicKey(pubkey));
    console.log('cardClientMetadataSize')
    console.log(cardInfo)
    if (cardInfo?.data) {
      var clientMetadata = Buffer.from(cardInfo?.data);
      var clientMetadataSize = clientMetadata.readUInt32LE(0);
      clientMetadata = clientMetadata.slice(4, 4 + clientMetadataSize)
      console.log(clientMetadata)
      var picture = clientMetadata.readUInt32LE(0);
      var nameLength = clientMetadata.readUInt32LE(4);
      var descriptionLength = clientMetadata.readUInt32LE(4 + nameLength);
      var name = clientMetadata.toString('utf8', 8, 8 + nameLength);
      var description = clientMetadata.toString('utf8', 12 + nameLength, 12 + nameLength + descriptionLength);
      return {
        Picture: picture,
        Name: name,
        Description: description,
      }
    }
    return {
      Picture: 0,
      Name: "Error",
      Description: "Error",
    }
  }





  const updateBoard = async () => {
    var cookies = new Cookies();
    var boardAccountKey = cookies.get('boardAccountKey');
    if (boardAccountKey) {
      var accInfo = await connection.getAccountInfo(new PublicKey(boardAccountKey));
        if (accInfo?.data) {
          var buf = Buffer.from(accInfo?.data);
          await updateBoardCollectionMetadata(buf);
          var boardData = serializeBoardData(buf);
          //const distCards = [...new Set(boardData?.Cards.map(x => x.MintAddress))];
          // var newBoardCollection = {};
          // var newBoardCollection: { [id: string] : Object; } = {};
          // for (let i = 0; i < distCards.length; i++) {
          //   console.log('destCard')
          //   var key = distCards[i];
          //   console.log(key)
          //   let metadata = await getCardClientMetaData(key);
          //   console.log(metadata);
          //   if (metadata) {
          //     newBoardCollection[key] = metadata
          //   }
          // }
          // boardCollection = newBoardCollection;
          // console.log(boardCollection);
          unityContext.send("ReactToUnity", "UpdateBoard", JSON.stringify(boardData));            
        }
      }
  }

  const updateBoardCollectionMetadata = async (buf: Buffer) => {
    var newBoardCollection : { [id: string] : Object; } = {};
    var players = buf.readUInt32LE(0)
    var playerSize = 32 + 12
    var cardsOffset = 4 + playerSize * players
    var cards = buf.readUInt32LE(cardsOffset)
    var cardSize = 37
    for (let i = 0; i < cards; i++) {
      var cardKey = new PublicKey(buf.subarray(cardsOffset + 8 + cardSize * i, cardsOffset + 8 + 32 + cardSize * i)).toBase58(); 
      if (!newBoardCollection[cardKey]) {
        newBoardCollection[cardKey] = await getCardClientMetaData(cardKey);
      } 
    }
    boardCollection = newBoardCollection;
  }


  const serializeBoardData = (buf: Buffer) => {
    if (wallet?.publicKey) {
      var playersArray = [];
      var cardsArray = [];

      var players = buf.readUInt32LE(0)
      var playerSize = 32 + 12
      for (let i = 0; i < players; i++) {
        var playerKey = new PublicKey(buf.subarray(4 + i * playerSize, 36 + i * playerSize));
        playersArray.push({
          Address: playerKey.toBase58(),
          IsActive: Boolean(buf.readInt32LE(36 + (i * playerSize))),
          HP: buf.readInt32LE(36 + (i * playerSize) + 4),
          Coins: buf.readInt32LE(36 + (i * playerSize) + 8),
          IsMe: playerKey.toBase58() == wallet.publicKey.toBase58(),
        })
      }
      var cardsOffset = 4 + playerSize * players
      var cards = buf.readUInt32LE(cardsOffset)
      var cardSize = 37
      for (let i = 0; i < cards; i++) {
        var cardKey = new PublicKey(buf.subarray(cardsOffset + 8 + cardSize * i, cardsOffset + 8 + 32 + cardSize * i)).toBase58();
        var cardData = {
          CardId: buf.readInt32LE(cardsOffset + 4 + cardSize * i),
          MintAddress: cardKey,
          CardPlace: buf.readUInt8(cardsOffset + 40 + cardSize * i),
          Metadata: {},
        }
        if (boardCollection[cardKey]) {
          cardData.Metadata = boardCollection[cardKey]
        } else {
          cardData.Metadata = {
            Picture: 69,
            Name: "Error",
            Description: "Error",
          }
        }
        cardsArray.push(cardData);
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
          space: 2353,
          lamports: await connection.getMinimumBalanceForRentExemption(2353, 'singleGossip'),
          fromPubkey: wallet.publicKey,
          newAccountPubkey: boardAccount.publicKey,
        });
        accounts.push(boardAccount);
        var instructions = [createBoardAccountIx];
        var testCardPubkey = new PublicKey('Dv2mAZZUqn2TASfQZbkdBsc1XwvgUpwsX2BNDnTJxGST');
        var testCardPubkey2 = new PublicKey('Dv2mAZZUqn2TASfQZbkdBsc1XwvgUpwsX2BNDnTJxGST');
        var buf = Buffer.allocUnsafe(11);
        buf.writeInt8(1, 0); // instruction = createBoard
        buf.writeUInt32LE(30, 1); // 30 cards
        buf.writeInt8(1, 5); // to deck
        buf.writeUInt32LE(30, 6); // 60 cards
        buf.writeInt8(1, 10); // to deck
        console.log('Sending buffer', buf);

        const createBoardIx = new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
            { pubkey: boardAccount.publicKey, isSigner: false, isWritable: true },
            { pubkey: testCardPubkey, isSigner: false, isWritable: false },
            { pubkey: testCardPubkey2, isSigner: false, isWritable: false },
          ],
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
        sendTransaction(connection, wallet, instructions, accounts).then(() => {
          notify({
            message: "Board started",
            description: "Started board " + boardAccount.publicKey,
          });
          var cookies = new Cookies();
          cookies.set('boardAccountKey', boardAccount.publicKey.toBase58());
          updateBoard();
        });
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
        });
      }
    }
  };
  unityContext.on("CreateBoard", createBoard);
  unityContext.on("JoinBoard", (boardAccountKey) => joinBoard(boardAccountKey));


  const createCard = async (cardData: string, cardName: string) => {

    console.log('createCard')
    console.log(cardData)
    var testData = '31|0|0|0|14|0|0|0|4|0|0|0|67|111|105|110|15|0|0|0|71|105|118|101|115|32|111|110|101|32|109|111|110|101|121|0|0|0|0|2|0|0|0|1|0|0|0|100|0|0|0|2|0|0|0|0|0|0|0|2|0|0|0|0|0|0|0|1|0|0|0|0|0|0|0|100|0|0|0|2|0|0|0|2|0|0|0|2|0|0|0|0|0|0|0|3|0|0|0|2|0|0|0|100|0|0|0|0|0|0|0|2|0|0|0|0|0|0|0|2|0|0|0|0|0|0|0|2|0|0|0|1|0|0|0|6|0|0|0|2|0|0|0|100|0|0|0|2|0|0|0|2|0|0|0|101|0|0|0|2|0|0|0|0|0|0|0|1|0|0|0|0|0|0|0|1|0|0|0|0|0|0|0|101|0|0|0|2|0|0|0|2|0|0|0|101|0|0|0|2|0|0|0|3|0|0|0|2|0|0|0|100|0|0|0|0|0|0|0|2|0|0|0|101|0|0|0|2|0|0|0|0|0|0|0|2|0|0|0|0|0|0|0|103|0|0|0|2|0|0|0|0|0|0|0|1|0|0|0|0|0|0|0|100|0|0|0|2|0|0|0|0|0|0|0|2|0|0|0|2|0|0|0|0|0|0|0|1|0|0|0|0|0|0|0|100|0|0|0|2|0|0|0|0|0|0|0|2|0|0|0|0|0|0|0|1|0|0|0|0|0|0|0|102|0|0|0|2|0|0|0|2|0|0|0|101|0|0|0|2|0|0|0|0|0|0|0|1|0|0|0|0|0|0|0|100|0|0|0|2|0|0|0|2|0|0|0|2|0|0|0|103|0|0|0|2|0|0|0|0|0|0|0|2|0|0|0'
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
          space: buf.length,
          lamports: await connection.getMinimumBalanceForRentExemption(buf.length, 'singleGossip'),
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
          console.log("test");
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
    updateCollection();
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
              { pubkey: cardPubkey, isSigner: false, isWritable: false },
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
          });
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
