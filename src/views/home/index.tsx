import { Button, Col, Row } from "antd";
import React, { useEffect } from "react";
import { Link } from "react-router-dom";
import { ConnectButton } from "../../components/ConnectButton";
import { TokenIcon } from "../../components/TokenIcon";
import { useConnectionConfig, sendTransaction, useConnection } from "../../contexts/connection";
import { useMarkets } from "../../contexts/market";
import { useMint, useAccountByMint } from "../../contexts/accounts";
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


var onWalletConnectedCallback: () => Promise<boolean>;
export async function onWalletConnected() {
  onWalletConnectedCallback()
}

const joinedBufferToBuffer = function (joinedBuffer: string) {
  var strBytesArray = joinedBuffer.split('|');
  var buf = Buffer.allocUnsafe(strBytesArray.length );
  for (var i = 0; i < strBytesArray.length; i++) {
    buf.writeUInt8(parseInt(strBytesArray[i]), i);
  }
  return buf
}

var lastMessageNonce = 0;
var oldCardIndex = 0

const unityContext = new UnityContext({
  loaderUrl: "unity_build/summoner_8.loader.js",
  dataUrl: "unity_build/summoner_8.data",
  frameworkUrl: "unity_build/summoner_8.framework.js",
  codeUrl: "unity_build/summoner_8.wasm",
  streamingAssetsUrl: "StreamingAssets"
});

class SolanaBuffer {
  pos: number;
  buf: Buffer;
  constructor(buf: Buffer) {
    this.pos = 0;
    this.buf = buf;
  }

  read8() {
    this.pos += 1;
    return this.buf.readUInt8(this.pos - 1);
  }
  write8(number: number ) {
    this.buf.writeUInt8(number, this.pos);
    this.pos += 1;
  }

  readBool() {
    this.pos += 1;
    return this.buf.readUInt8(this.pos - 1) == 1 ? true : false;
  }
  writeBool(value: boolean ) {
    this.buf.writeUInt8(value ? 1 : 0, this.pos);
    this.pos += 1;
  }

  readu32() {
    this.pos += 4;
    return this.buf.readUInt32LE(this.pos - 4);;
  }
  writeu32(number: number) {
    this.buf.writeUInt32LE(number, this.pos);
    this.pos += 4;
  }

  readu64() {
    this.pos += 8;
    return this.buf.readUIntLE(this.pos - 8, 8);;
  }

  readi32() {
    this.pos += 4;
    return this.buf.readInt32LE(this.pos - 4);;
  }
  writei32(number: number) {
    this.buf.writeInt32LE(number, this.pos);
    this.pos += 4;
  }

  readPublicKey() {
    this.pos += 32;
    return new PublicKey(this.buf.subarray(this.pos - 32, this.pos));
  }
  writePublicKey(key: PublicKey) {
    this.writeBuffer(key.toBuffer())
  }

  readBuffer(len: number) {
    this.pos += len;
    return this.buf.slice(this.pos - len, this.pos)
  }
  writeBuffer(buf: Buffer) {
    for (let i = 0; i < buf.length; i++) {
      this.write8(buf[i])
    }
  }

  readString() {
    var len = this.readu32();
    this.pos += len;
    return this.buf.toString("utf8", this.pos - len, this.pos);
  }
  writeString(str: string) {
    this.writeu32(str.length)
    this.writeBuffer(Buffer.from(str, 'utf8'))
  }

  skip(number: number) {
    this.pos += number;
  }

  getWritten() {
    return this.buf.slice(0, this.pos)
  }

  getRest() {
    return this.buf.slice(this.pos, this.buf.length)
  }
}

export const HomeView = () => {

  onWalletConnectedCallback = async () => {
    updateBoard()
    updateLog()
    return true
  }

  type Brick = {
    Type: number,
    Subtype: number,
    HasField: boolean,
    IntField: number,
    StringField: string | null,
    Slots: Brick[],
  }

  type CardMetadata = {
    Picture: number,
    Coins: number,
    Name: string,
    Description: string,
  }

  type Card =  {
    MintAddress: string,
    Metadata: CardMetadata,
    BrickTree: {
      Genesis: Brick,
    }
  }

  type Ruleset = {
    CardMintAddresses: string[],
    Deck: {
      PlaceId: number,
      IndexAmount: {
        Index: number,
        Amount: number,
      }[],
    }[],
    DisplayData: {
      PlayerDisplayDatas: {
        PlaceId: number,
        IsVisible: boolean,
        HorizontalAnchors: {
          X1: number,
          X2: number,
        },
        VerticalAnchors: {
          Y1: number,
          Y2: number,
        },
        CardFaceOption: number,
        CardLayoutOption: number,
      }[]
    }
  }

  type FightLog = {
    Steps: LogEntry[],
  }

  type LogEntry = {
    playerId: number,
    actionType: number,
    data: number,
  }

  type Collection = {
    CardTypes: {
      MintAddress: string
      Metadata: CardMetadata,
      BrickTree: {
        Genesis: Brick,
      }
    }[]
    RulesetData: Ruleset,
  }

  const serializeCollection = (collection: Collection, sbuf: SolanaBuffer) => {
    sbuf.writeu32(collection.CardTypes.length)
    collection.CardTypes.forEach((cardData) => {
      sbuf.writePublicKey(new PublicKey(cardData.MintAddress))
    })
  }

  const getRuleset = async () => {
    var cookies = new Cookies()
    const rulesetPointerKey = await PublicKey.createWithSeed(
      new PublicKey(cookies.get('ruleset')), //card key
      'SolceryRuleset',
      programId,
    );
    var rulesetPointerInfo = await connection.getAccountInfo(rulesetPointerKey)
    var rulesetAccountKey = new PublicKey(rulesetPointerInfo?.data!)
    var rulesetAccountInfo = await connection.getAccountInfo(rulesetAccountKey)
    var ruleset = deserializeRuleset(new SolanaBuffer(rulesetAccountInfo?.data!))
    return ruleset;
  }

  const deserializeCollection = async (sbuf: SolanaBuffer) => {
    var cardTypes: {
      MintAddress: string
      Metadata: CardMetadata,
      BrickTree: {
        Genesis: Brick
      },
    }[] = [];
    if (sbuf.buf.length > 3) {
      let cardsAmount = sbuf.readu32()
      for (let i = 0; i < cardsAmount; i++) {
        var mintAccountPublicKey = sbuf.readPublicKey()
        const cardLinkAccountPublicKey = await PublicKey.createWithSeed(
          mintAccountPublicKey,
          'SolceryCard',
          programId,
        );
        var accInfo = await connection.getAccountInfo(cardLinkAccountPublicKey);
        var cardAccInfo = await connection.getAccountInfo(new PublicKey(accInfo?.data!));
        var card = deserializeCard(new SolanaBuffer(cardAccInfo?.data!))
        cardTypes.push({
          MintAddress: mintAccountPublicKey.toBase58(),
          Metadata: card.Metadata,
          BrickTree: {
            Genesis: card.BrickTree.Genesis
          },
        });
      }
    }
    let rulesetData: Ruleset = {
      CardMintAddresses: [],
      Deck: [
      {
        PlaceId: 0,
        IndexAmount: [],
      }],
      DisplayData: {
        PlayerDisplayDatas: []
      }
    }

    // TODO


    let result: Collection = {
      CardTypes: cardTypes,
      RulesetData: rulesetData,
    }
    return result
  }

  const serializeRuleset = (ruleset: Ruleset, sbuf: SolanaBuffer) => {
    sbuf.writeu32(ruleset.CardMintAddresses.length)
    ruleset.CardMintAddresses.forEach((mintAddress) => {
      sbuf.writePublicKey(new PublicKey(mintAddress))
    })
    sbuf.writeu32(ruleset.Deck.length)
    ruleset.Deck.forEach((placeData) => {
      sbuf.writeu32(placeData.PlaceId)
      sbuf.writeu32(placeData.IndexAmount.length)
      placeData.IndexAmount.forEach((indexAmount) => {
        sbuf.writeu32(indexAmount.Index)
        sbuf.writeu32(indexAmount.Amount)
      })
    })
    sbuf.writeu32(ruleset.DisplayData.PlayerDisplayDatas.length)
    ruleset.DisplayData.PlayerDisplayDatas.forEach((displayData) => {
      sbuf.writeu32(displayData.PlaceId)
      sbuf.writeBool(displayData.IsVisible)
      sbuf.writeu32(displayData.HorizontalAnchors.X1)
      sbuf.writeu32(displayData.HorizontalAnchors.X2)
      sbuf.writeu32(displayData.VerticalAnchors.Y1)
      sbuf.writeu32(displayData.VerticalAnchors.Y2)
      sbuf.writeu32(displayData.CardFaceOption)
      sbuf.writeu32(displayData.CardLayoutOption)
    })
  }

  const deserializeRuleset = (sbuf: SolanaBuffer) => {
    var CardMintAddresses = []
    var cardTypesAmount = sbuf.readu32()
    for (let i = 0; i < cardTypesAmount; i++) {
      CardMintAddresses.push(sbuf.readPublicKey().toBase58())
    }
    var Deck = []
    var placesAmount = sbuf.readu32()
    for (let i = 0; i < placesAmount; i++) {
      var placeId = sbuf.readu32()
      var IndexAmount = []
      var placeSize = sbuf.readu32()
      for (let j = 0; j < placeSize; j++) {
        IndexAmount.push({
          Index: sbuf.readu32(),
          Amount: sbuf.readu32(),
        })
      }
      Deck.push({ 
        PlaceId: placeId,
        IndexAmount: IndexAmount
      })
    }
    var playerDisplayDatas = []
    var displayDataSize = sbuf.readu32()
    for (let i = 0; i < displayDataSize; i++) {
      playerDisplayDatas.push({
        PlaceId: sbuf.readu32(),
        IsVisible: sbuf.readBool(),
        HorizontalAnchors: {
          X1: sbuf.readu32(),
          X2: sbuf.readu32(),
        },
        VerticalAnchors: {
          Y1: sbuf.readu32(),
          Y2: sbuf.readu32(),
        },
        CardFaceOption: sbuf.readu32(),
        CardLayoutOption : sbuf.readu32(),
      })
    }
    return {
      CardMintAddresses: CardMintAddresses,
      Deck: Deck,
      DisplayData: {
        PlayerDisplayDatas: playerDisplayDatas,
      }
    }
  }

  type BrickConfig = {
    Type: number,
    Subtype: number,
    FieldType: number, //0 = None, 1 - int, 2 - string
    Slots: number,
  }

  var brickConfigs: BrickConfig[] = [
    //Actions
    { Type: 0, Subtype: 0, FieldType: 0, Slots: 0, }, //Void
    { Type: 0, Subtype: 1, FieldType: 0, Slots: 2, }, //Set
    { Type: 0, Subtype: 2, FieldType: 0, Slots: 3, }, //Conditional
    { Type: 0, Subtype: 3, FieldType: 0, Slots: 2, }, //Loop
    { Type: 0, Subtype: 4, FieldType: 1, Slots: 0, }, //Card
    { Type: 0, Subtype: 5, FieldType: 2, Slots: 0, }, //Show message
    { Type: 0, Subtype: 6, FieldType: 2, Slots: 1, }, //Set context var
    { Type: 0, Subtype: 100, FieldType: 0, Slots: 1, }, //MoveTo
    { Type: 0, Subtype: 101, FieldType: 1, Slots: 2, }, //SetPlayerAttr
    { Type: 0, Subtype: 102, FieldType: 1, Slots: 2, }, //AddPlayerAttr
    { Type: 0, Subtype: 103, FieldType: 0, Slots: 3, }, //ApplyToPlace
    { Type: 0, Subtype: 104, FieldType: 1, Slots: 2, }, //SubPlayerAttr

    //Conditions
    { Type: 1, Subtype: 0, FieldType: 0, Slots: 0, }, //True
    { Type: 1, Subtype: 1, FieldType: 0, Slots: 0, }, //False
    { Type: 1, Subtype: 2, FieldType: 0, Slots: 2, }, //Or
    { Type: 1, Subtype: 3, FieldType: 0, Slots: 2, }, //And
    { Type: 1, Subtype: 4, FieldType: 0, Slots: 1, }, //Not
    { Type: 1, Subtype: 5, FieldType: 0, Slots: 2, }, //Equal
    { Type: 1, Subtype: 6, FieldType: 0, Slots: 2, }, //GreaterThan
    { Type: 1, Subtype: 7, FieldType: 0, Slots: 2, }, //LesserThan
    { Type: 1, Subtype: 100, FieldType: 0, Slots: 1, }, //IsAtPlace

    //Values
    { Type: 2, Subtype: 0, FieldType: 1, Slots: 0, }, //Const,
    { Type: 2, Subtype: 1, FieldType: 0, Slots: 3, }, //Conditional
    { Type: 2, Subtype: 2, FieldType: 0, Slots: 2, }, //Add
    { Type: 2, Subtype: 3, FieldType: 0, Slots: 2, }, //Sub
    { Type: 2, Subtype: 4, FieldType: 2, Slots: 0, }, //GetCtxVar
    { Type: 2, Subtype: 5, FieldType: 0, Slots: 2, }, //GetCtxVar
    { Type: 2, Subtype: 6, FieldType: 0, Slots: 2, }, //Mul
    { Type: 2, Subtype: 3, FieldType: 0, Slots: 2, }, //Div
    { Type: 2, Subtype: 2, FieldType: 0, Slots: 2, }, //Modulo
    { Type: 2, Subtype: 100, FieldType: 1, Slots: 1, }, //GetPlayerAttr
    { Type: 2, Subtype: 101, FieldType: 0, Slots: 0, }, //GetPlayerIndex
    { Type: 2, Subtype: 102, FieldType: 0, Slots: 1, }, //GetCardsAmount
    { Type: 2, Subtype: 103, FieldType: 0, Slots: 0, }, //CurrentPlace
    { Type: 2, Subtype: 105, FieldType: 0, Slots: 0, }, //CasterPlayerIndex

  ]
  // for (var conf in brickConfigsClient.ConfigsByType.Action) {

  // }
  const getBrickConfig = (type: number, subtype: number) => {
    var t = type.toString()
    var st = subtype.toString()
    for (let i = 0; i < brickConfigs.length; i++) {
      if (brickConfigs[i].Type == type && brickConfigs[i].Subtype == subtype)
        return brickConfigs[i]
    }
    return {
      Type: type,
      Subtype: subtype,
      FieldType: 0,
      Slots: [],
    }
  }


  const serializeBrick = (brick: Brick, buffer: SolanaBuffer) => {
    buffer.writeu32(brick.Type)
    buffer.writeu32(brick.Subtype)
    if (brick.HasField && !brick.StringField) {
      buffer.writei32(brick.IntField)
    }
    if (brick.HasField && brick.StringField) {
      buffer.writeString(brick.StringField)
    }
    brick.Slots.forEach((slot) => {
      serializeBrick(slot, buffer)
    })
  }


  const deserializeBrick = (buffer: SolanaBuffer) => {
    var type = buffer.readu32()
    var subtype = buffer.readu32()
    var config = getBrickConfig(type, subtype)
    var intField = 0
    var stringField = null
    var slots = []
    if (config.FieldType == 1)
      intField = buffer.readi32()
    if (config.FieldType == 2)
      stringField = buffer.readString()
    for (let i = 0; i < config.Slots; i++) {
      slots.push(deserializeBrick(buffer))
    }
    var result: Brick = {
      Type: type,
      Subtype: subtype,
      HasField: config.FieldType == 1 || config.FieldType == 2,
      IntField: intField,
      StringField: stringField,
      Slots: slots,
    }
    return result
  }

  const serializeCard = (card: Card, buffer: SolanaBuffer) => {
    var clientMetadataSize = 16 + card.Metadata.Name.length + card.Metadata.Description.length
    buffer.writeu32(clientMetadataSize)
    buffer.writeu32(card.Metadata.Picture)
    buffer.writeu32(card.Metadata.Coins)
    buffer.writeString(card.Metadata.Name)
    buffer.writeString(card.Metadata.Description)
    serializeBrick(card.BrickTree.Genesis, buffer)

  }

  const deserializeCard = (buffer: SolanaBuffer, board: boolean = false) => {
    if (board) {
      var cardDataSize = buffer.readu32();
    }
    var clientMetadataSize = buffer.readu32();
    var md = {
      Picture: buffer.readu32(),
      Coins: buffer.readu32(),
      Name: buffer.readString(),
      Description: buffer.readString(),
    }
    return {
      Metadata: md,  
      BrickTree: {
        Genesis: deserializeBrick(buffer), 
      },
    }
  }


  const getCardClientMetaData = (cardData: Buffer) => {
    if (cardData.length <= 0) {
      return {
        Picture: 1,
        Coins: 0,
        Name: "Error",
        Description: "Error",
      }
    }
    var clientMetadataSize = cardData.readUInt32LE(0);
    var buffer = new SolanaBuffer(cardData.slice(4, 4 + clientMetadataSize));
    return {
      Picture: buffer.readu32(),
      Coins: buffer.readu32(),
      Name: buffer.readString(),
      Description: buffer.readString(),
    }
  }

  const updateLog = async () => {
    if (wallet?.publicKey) {
      var playerAccountKey = await PublicKey.createWithSeed(
        wallet.publicKey,
        'SolceryAccountState6',
        programId,
      );
      var accInfo = await connection.getAccountInfo(playerAccountKey);
      if (accInfo?.data && accInfo?.data[0] != 0) {
        var boardAccountKey = new PublicKey(accInfo.data.slice(1));
        const fightLogAccountPublicKey = await PublicKey.createWithSeed(
          boardAccountKey,
          'SolceryFightLog',
          programId,
        );         
        var logInfo = await connection.getAccountInfo(fightLogAccountPublicKey);
        if (logInfo?.data) {
          var sbuf = new SolanaBuffer(logInfo.data)
          var steps: LogEntry[] = []
          var fightLogSize = sbuf.readu32()
          for (let i = 0; i < fightLogSize; i++) {
            steps.push({
              playerId: sbuf.readu32(),
              actionType: sbuf.readu32(),
              data: sbuf.readu32(),
            })
          }
          var fightLog = {
            Steps: steps
          }
          unityContext.send("ReactToUnity", "UpdateLog", JSON.stringify(fightLog));  
        }
      }
    }
  }

  const updateBoard = async () => {
    if (wallet?.publicKey) {
      var playerAccountKey = await PublicKey.createWithSeed(
        wallet.publicKey,
        'SolceryAccountState6',
        programId,
      );
      var accInfo = await connection.getAccountInfo(playerAccountKey);
       if (accInfo?.data && accInfo?.data[0] != 0) {
        var boardAccountKey = new PublicKey(accInfo.data.slice(1))
        var boardInfo = await connection.getAccountInfo(boardAccountKey);
        if (boardInfo?.data) {
          var buf = Buffer.from(boardInfo.data);
          var boardData = await serializeBoardData(buf);
          if (boardData) {
            if (boardData.Message.Nonce != lastMessageNonce) {
              notify({
                message: "Message",
                description: boardData.Message.Message,
              });
              lastMessageNonce = boardData.Message.Nonce
            }
          }
          if (boardData !== undefined) {
            unityContext.send("ReactToUnity", "UpdateBoard", JSON.stringify(boardData));            
          }
        }
      }
    }
  }

  const serializeBoardData = async (buf: Buffer) => {
    if (wallet?.publicKey) {
      var playersArray = [];
      var cardsArray = [];
      var cardTypes = [];
      var buffer = new SolanaBuffer(buf);
      var lastUpdate = buffer.readu64()
      var step = buffer.readu32()
      var players = buffer.readu32()
      for (let i = 0; i < players; i++) {
        var address = buffer.readPublicKey();
        var player = {
          Address: address.toBase58(),
          IsActive: Boolean(buffer.readu32()),
          HP: buffer.readu32(),
          Coins: buffer.readu32(),
          IsMe: address.toBase58() == wallet.publicKey.toBase58(),
          Attrs: [0]
        }
        var attrs = []
        for (let i = 0; i < 10; i ++) {
          attrs.push(buffer.readu32())
        }
        player.Attrs = attrs
        playersArray.push(player)
      }
      var cardTypesAmount = buffer.readu32();
      for (let i = 0; i < cardTypesAmount; i++) {
        var cardId = buffer.readu32()
        var cardType = deserializeCard(buffer, true)
        var x = {
          Id: cardId,
          Metadata: cardType.Metadata,
          BrickTree: cardType.BrickTree,
        }
        cardTypes.push(x);
      }
      var cards = buffer.readu32()
      for (let i = 0; i < cards; i++) {
        var id = buffer.readu32()
        var cardTypeId = buffer.readu32()
        cardsArray.push({
          CardId: id,
          CardType: cardTypeId,
          CardPlace: buffer.readu32(),
        });
      }
      var messageNonce = buffer.readu32()
      var messageLen = buffer.readu32()
      var messageBuffer = buffer.readBuffer(128).slice(0, messageLen)
      var message = messageBuffer.toString('utf8')

      return {
        LastUpdate: lastUpdate,
        Players: playersArray,
        Cards: cardsArray,
        CardTypes: cardTypes,
        Message: {
          Nonce: messageNonce,
          Message: message,
          Duration: 5,
        },
        Random: {
          x: buffer.readu32(),
          y: buffer.readu32(),
          z: buffer.readu32(),
          w: buffer.readu32(),
        },
        EndTurnCardId: 1,
      }
    }
  }

 
  const getPointerData = async (pointerAccountPublicKey: PublicKey) => {
    var pointerAccountData = await connection.getAccountInfo(pointerAccountPublicKey)
    var dataAccountPublicKey = pointerAccountData?.data!
    var dataAccountData = await connection.getAccountInfo(new PublicKey(dataAccountPublicKey))
    return dataAccountData?.data!
  }

  type KeyInstruction = {
    pubkey: PublicKey,
    isSigner: boolean,
    isWritable: boolean,
  }

  const addCardsToBoard = async(boardAccountPubkey: PublicKey, basicKeys: KeyInstruction[], cards: string[]) => {
    if (wallet?.publicKey) {
      var amount = Math.min(10, cards.length)
      var keys = [...basicKeys]
      for (let i = 0; i < amount; i++) {
        var cardMintKey = cards.shift()
        const cardTypePointerKey = await PublicKey.createWithSeed(
          new PublicKey(cardMintKey!),
          'SolceryCard',
          programId,
        );
        var cardTypePointerData = await connection.getAccountInfo(cardTypePointerKey)
        var cardTypeMetadataKey = new PublicKey(cardTypePointerData?.data!)
        keys.push({ pubkey: cardTypePointerKey, isSigner: false, isWritable: false });
        keys.push({ pubkey: cardTypeMetadataKey, isSigner: false, isWritable: false });
      }
      var buf = Buffer.allocUnsafe(5);
      buf.writeUInt8(3, 0); // instruction = add card
      buf.writeUInt32LE(amount, 1);
      const addCardsToBoardIx = new TransactionInstruction({
        keys: keys,
        programId,
        data: buf,
      });
      await sendTransaction(connection, wallet, [addCardsToBoardIx], []).then( async () => {
        if (cards.length > 0) {
          await addCardsToBoard(boardAccountPubkey, basicKeys, cards)
        }
      }); 
    }
  }

  const findMatch = async () => {
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) { 
        var lobbyStateAccountInfo = await connection.getAccountInfo(lobbyAccountKey)
        var lobbyStateData = lobbyStateAccountInfo?.data
        if (lobbyStateData) {
          if (lobbyStateData.readUInt32LE(0) == 0) { // no people in queue, creating new fight
            createBoard()
          } else {
            var boardAccountKey = new PublicKey(lobbyStateData.slice(4, 36)) //
            joinBoard(boardAccountKey)
          }
        }
      }
    }
  }

  const createBoard = async () => {
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) { 
        var ruleset = rulesetJson.RulesetData;
        // var ruleset = JSON.parse(rulesetJson);
        var instructions: TransactionInstruction[] = []
        var accounts: Account[] = [];
        var boardAccount = new Account()
        const rulesetPointerPublicKey = new PublicKey('3LYm9BBugVhBaUogZMqg26RXrNKX6acdWTfkk8pH4GeM');
        const rulesetAccountKey = new PublicKey('Bq9M7CC8PZ3GRL2Lxx11Lp68jML9CxbuYu5BJXAkh11E')

        var createBoardAccountIx = SystemProgram.createAccount({
          programId: programId,
          space: 50000, // TODO
          lamports: await connection.getMinimumBalanceForRentExemption(50000, 'singleGossip') / 12,
          fromPubkey: wallet.publicKey,
          newAccountPubkey: boardAccount.publicKey,
        });
        accounts.push(boardAccount)
        instructions.push(createBoardAccountIx)

        const fightLogAccountPublicKey = await PublicKey.createWithSeed(
          boardAccount.publicKey,
          'SolceryFightLog',
          programId,
        );
        var createFightLogAccountIx = SystemProgram.createAccountWithSeed({
          fromPubkey: wallet.publicKey,
          basePubkey: boardAccount.publicKey,
          seed: 'SolceryFightLog',
          newAccountPubkey: fightLogAccountPublicKey,
          lamports: await connection.getMinimumBalanceForRentExemption(32000, 'singleGossip'),
          space: 32000,
          programId: programId,
        });
        instructions.push(createFightLogAccountIx)

        var randomSeed = Math.floor(Math.random() * 400000)
        var buf = Buffer.allocUnsafe(5)
        buf.writeUInt8(2, 0)
        buf.writeUInt32LE(randomSeed, 1)
        var keys = [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: statAccountKey, isSigner: false, isWritable: true },
          { pubkey: boardAccount.publicKey, isSigner: false, isWritable: true },
          { pubkey: fightLogAccountPublicKey, isSigner: false, isWritable: true },
          { pubkey: rulesetPointerPublicKey, isSigner: false, isWritable: false },
          { pubkey: rulesetAccountKey, isSigner: false, isWritable: false },
        ]
        const createBoardIx = new TransactionInstruction({
          keys: keys,
          programId,
          data: buf,
        });
        instructions.push(createBoardIx);
        var keys = [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: boardAccount.publicKey, isSigner: false, isWritable: true },
          { pubkey: rulesetPointerPublicKey, isSigner: false, isWritable: false },
          { pubkey: rulesetAccountKey, isSigner: false, isWritable: false },
        ]
        
        return await sendTransaction(connection, wallet, instructions, accounts).then( async () => {
          return await addCardsToBoard(boardAccount.publicKey, keys, ruleset.CardMintAddresses).then( async () => {
            joinBoard(boardAccount.publicKey)
            return boardAccount.publicKey
          })
        })
      }
    }
  }
  unityContext.on("CreateBoard", async () => {
    findMatch()
  });

  const joinBoard = async (boardAccountPublicKey: PublicKey) => {
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) {
        var accounts: Account[];
        accounts = []
      
        var instructions = [];
        const fightLogAccountPublicKey = await PublicKey.createWithSeed(
          boardAccountPublicKey,
          'SolceryFightLog',
          programId,
        );

        var playerAccountKey = await PublicKey.createWithSeed(
          wallet.publicKey,
          'SolceryAccountState6',
          programId,
        );
        var playerAccountData = await connection.getAccountInfo(playerAccountKey)
        if (!playerAccountData) {
          var createPlayerAccountIx = SystemProgram.createAccountWithSeed({
            fromPubkey: wallet.publicKey,
            basePubkey: wallet.publicKey,
            seed: 'SolceryAccountState6',
            newAccountPubkey: playerAccountKey,
            lamports: await connection.getMinimumBalanceForRentExemption(33, 'singleGossip'),
            space: 33,
            programId: programId,
          });
          instructions.push(createPlayerAccountIx)
        }

        const joinBoardIx = new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
            { pubkey: playerAccountKey, isSigner: false, isWritable: true },
            { pubkey: lobbyAccountKey, isSigner: false, isWritable: true },
            { pubkey: boardAccountPublicKey, isSigner: false, isWritable: true },
            { pubkey: fightLogAccountPublicKey, isSigner: false, isWritable: true },
          ],
          programId,
          data: Buffer.from([4]), // instruction = joinBoard
        });
        instructions.push(joinBoardIx);
        sendTransaction(connection, wallet, instructions, accounts).then(() => {
          notify({
            message: "Board started",
            description: "Started board " + boardAccountPublicKey,
          });
          var cookies = new Cookies();
          updateBoard();
          connection.onAccountChange(boardAccountPublicKey, updateBoard)
          updateLog();
          connection.onAccountChange(fightLogAccountPublicKey, updateLog)
        },
        () => notify({
          message: "Board join failed",
          description: "Some error",
        }));
      }
    }
  };
  unityContext.on("JoinBoard", (boardAccountStringKey) => joinBoard(new PublicKey(boardAccountStringKey)));

  var connection = useConnection();
  const { marketEmitter, midPriceInUSD } = useMarkets();
  const { tokenMap } = useConnectionConfig();
  const SRM_ADDRESS = 'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt';
  const SRM = useUserBalance(SRM_ADDRESS);
  const SOL = useUserBalance(WRAPPED_SOL_MINT);
  const { balanceInUSD: totalBalanceInUSD } = useUserTotalBalance();
  const { wallet, connected, connect, select, provider } = useWallet();
  var connection = useConnection();

  var lastEntityMintAdress = '';
  var lastEntityAccount: Account[]
  var lastBoardUpdate: number;
  
  const rulesetJson = require('./ruleset.json');


  var programId = new PublicKey("4YyCGiiZ3EorWmcQs3yrCRfTGt8udhDvV9ffJoWJaXUX");
  var lobbyAccountKey = new PublicKey("8t4XsAbA75xAq8LKdM97WFT1XyPxG3fPY1UNA4um6ywm"); // devnet
  var statAccountKey = new PublicKey("f7thdQfV9pcQMkVo9EjABraws75SFWrbUVrva1v1tbW"); //devnet

  unityContext.on("LogToConsole", (message) => {
    console.log(message);
  });

  unityContext.on("OnUnityLoaded", async () => {
    updateBoard();
    updateLog();
    var data = { IsConnected: connected };
    unityContext.send("ReactToUnity", "SetWalletConnected", JSON.stringify(data));
  });

  unityContext.on("OpenLinkInNewTab", (link: string) => {
    window.open(link, "_blank")
  });


  const logAction = async(log: FightLog) => {
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) {
        var playerAccountKey = await PublicKey.createWithSeed(
          wallet.publicKey,
          'SolceryAccountState6',
          programId,
        );
        var accInfo = await connection.getAccountInfo(playerAccountKey);
        if (accInfo?.data) {
          var boardAccountPubkey = new PublicKey(accInfo.data.slice(1));
          const fightLogAccountKey = await PublicKey.createWithSeed(
            boardAccountPubkey,
            'SolceryFightLog',
            programId,
          );
          const playerAccountKey = await PublicKey.createWithSeed(
            wallet.publicKey,
            'SolceryAccountState6',
            programId,
          );
          var sbuf = new SolanaBuffer(Buffer.allocUnsafe(5 + log.Steps.length * 12));
          sbuf.write8(5) // instruction = LogAction
          sbuf.writeu32(log.Steps.length)
          for (var i in log.Steps) {
            var action = log.Steps[i]
            sbuf.writeu32(action.playerId)
            sbuf.writeu32(action.actionType)
            sbuf.writeu32(action.data)
          }
          const castIx = new TransactionInstruction({
            keys: [
              { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
              { pubkey: playerAccountKey, isSigner: false, isWritable: true },
              { pubkey: boardAccountPubkey, isSigner: false, isWritable: false },
              { pubkey: fightLogAccountKey, isSigner: false, isWritable: true },
            ],
            programId,
            data: sbuf.buf,
          });
          sendTransaction(connection, wallet, [castIx], []).then(async () => {
            updateLog();
          },
          () => {
            updateLog();
            notify({
              message: "Cast card failed",
              description: "reason",
            })
          }
          );
        }
      }
    }    
  }
  unityContext.on("LogAction", (actionJson) => {
    var action = JSON.parse(actionJson)
    logAction(action)
  });

  const setEntityData = async (entityAccountPublicKey: PublicKey, data: SolanaBuffer, accounts: Account[]) => {
    const MAX_DATA_SIZE = 500
    if (wallet?.publicKey) { 
      var accounts = [...accounts]
      var rest = data.getRest()
      var instructionBuffer = new SolanaBuffer(Buffer.allocUnsafe(5))
      instructionBuffer.write8(0)
      instructionBuffer.writeu32(data.pos)
      if (rest.length <= MAX_DATA_SIZE) {
        const setDataAccountDataIx = new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
            { pubkey: entityAccountPublicKey, isSigner: false, isWritable: true },
          ],
          programId,
          data: Buffer.concat([ instructionBuffer.buf, rest]),
        });
        await sendTransaction(connection, wallet, [setDataAccountDataIx], accounts, true)
      } 
      else {
        rest = rest.slice(0, MAX_DATA_SIZE)
        const setDataAccountDataIx = new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
            { pubkey: entityAccountPublicKey, isSigner: false, isWritable: true },
          ],
          programId,
          data: Buffer.concat([ instructionBuffer.buf, rest]),
        });
        await sendTransaction(connection, wallet, [setDataAccountDataIx], accounts, true).then( async () => {
          data.pos += MAX_DATA_SIZE
          await setEntityData(entityAccountPublicKey, data, accounts)
        })
      }
    }
  }

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
  //<Row>
  //</Row>

  );
 
  
};
