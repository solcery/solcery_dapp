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
  return buf
}

const unityContext = new UnityContext({
  loaderUrl: "unity_build/31.loader.js",
  dataUrl: "unity_build/31.data",
  frameworkUrl: "unity_build/31.framework.js",
  codeUrl: "unity_build/31.wasm",
  streamingAssetsUrl: "StreamingAssets"
});

export const HomeView = () => {
  var boardCollection = {};

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
    if (cardInfo) {
      if (cardInfo.data) {
        var clientMetadata = Buffer.from(cardInfo.data).subarray(4);
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
    }
  }

  const updateBoard = async () => {
    var cookies = new Cookies();
    var boardAccountKey = cookies.get('boardAccountKey');
    if (boardAccountKey) {
      var accInfo = await connection.getAccountInfo(new PublicKey(boardAccountKey));
      if (accInfo) {
        if (accInfo.data) {
          var buf = Buffer.from(accInfo.data);
          var boardData = serializeBoardData(buf);
          // const distCards = [...new Set(boardData?.Cards.map(x => x.MintAddress))];
          // // var newBoardCollection = {};
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
          Hp: buf.readInt32LE(36 + (i * playerSize) + 4),
          Coins: buf.readInt32LE(36 + (i * playerSize) + 8),
          IsMe: playerKey.toBase58() == wallet.publicKey.toBase58(),
        })
      }
      var cardsOffset = 4 + playerSize * players
      var cards = buf.readUInt32LE(cardsOffset)
      var cardSize = 37
      for (let i = 0; i < cards; i++) {
        cardsArray.push({
          CardId: buf.readInt32LE(cardsOffset + 4 + cardSize * i),
          MintAddress: new PublicKey(buf.subarray(cardsOffset + 8 + cardSize * i, cardsOffset + 8 + 32 + cardSize * i)).toBase58(),
          CardPlace: buf.readUInt8(cardsOffset + 40 + cardSize * i),
          Metadata: {
            Picture: 69,
            Name: "Good card",
            Description: "Descriptive description",
          },
        });
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
        var testCardPubkey = new PublicKey('3evdg8vvr5362siHC7orV8ayQ6SG3BGgcWTUzvogvvyQ');
        var buf = Buffer.allocUnsafe(6);
        buf.writeInt8(1, 0); // instruction = createBoard
        buf.writeUInt32LE(60, 1); // 60 cards
        buf.writeInt8(1, 5); // to deck
        console.log('Sending buffer', buf);

        const createBoardIx = new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
            { pubkey: boardAccount.publicKey, isSigner: false, isWritable: true },
            { pubkey: testCardPubkey, isSigner: false, isWritable: false },
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
        var boardAccountPublicKey = new PublicKey(boardAccountKey);

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
    var accounts: Account[];
    accounts = [];
    var buf = joinedBufferToBuffer(cardData);
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) {
        let instructions: TransactionInstruction[] = [];
        var mintAccountPublicKey = createUninitializedMint(
          instructions,
          wallet.publicKey,
          await connection.getMinimumBalanceForRentExemption(MintLayout.span, 'singleGossip'),
          accounts
        );

        var createMintIx = Token.createInitMintInstruction(
          TOKEN_PROGRAM_ID,
          mintAccountPublicKey,
          0,
          wallet.publicKey,
          wallet.publicKey,
        );
        instructions.push(createMintIx);

        let tokenAccountPublicKey = createTokenAccount(
          instructions,
          wallet.publicKey,
          await connection.getMinimumBalanceForRentExemption(AccountLayout.span, 'singleGossip'),
          mintAccountPublicKey,
          wallet.publicKey,
          accounts
        );

        var mintIx = Token.createMintToInstruction(
          TOKEN_PROGRAM_ID,
          mintAccountPublicKey,
          tokenAccountPublicKey,
          wallet.publicKey,
          [],
          1,
        );
        instructions.push(mintIx);

        var setMintAuthorityIx = Token.createSetAuthorityInstruction(
          TOKEN_PROGRAM_ID,
          mintAccountPublicKey,
          null,
          'MintTokens',
          wallet.publicKey,
          [],
        );
        instructions.push(setMintAuthorityIx);

        const cardMetadataAccountPublicKey = await PublicKey.createWithSeed(
          mintAccountPublicKey, //card key
          'SOLCERYCARD',
          programId,
        );
        var createCardMetadataIx = SystemProgram.createAccountWithSeed({
          fromPubkey: wallet.publicKey,
          basePubkey: mintAccountPublicKey,
          seed: 'SOLCERYCARD',
          newAccountPubkey: cardMetadataAccountPublicKey,
          lamports: await connection.getMinimumBalanceForRentExemption(buf.length, 'singleGossip'),
          space: buf.length - 1,
          programId: programId,
        });
        instructions.push(createCardMetadataIx); // Mb we want this one to be in rust code?    

        const saveMetadataIx = new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
            { pubkey: cardMetadataAccountPublicKey, isSigner: false, isWritable: true },
            { pubkey: mintAccountPublicKey, isSigner: false, isWritable: false }
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
            description: "Created card " + cardMetadataAccountPublicKey.toBase58(),
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



  unityContext.on("UseCard", (cardAccountKey) => {
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
          var buf = Buffer.allocUnsafe(1);
          buf.writeInt8(2, 0); // instruction = cast

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
