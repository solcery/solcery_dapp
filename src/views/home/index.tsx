import { useConnectionConfig, sendTransaction, useConnection } from "../../contexts/connection";
import { notify } from "../../utils/notifications";
import { useWallet, WalletAdapter } from "../../contexts/wallet";
import { Account, Connection, Transaction, TransactionInstruction, PublicKey } from "@solana/web3.js";
import { createUninitializedMint, createTokenAccount } from "../../actions/account"
import Unity, { UnityContext } from "react-unity-webgl";
import { AccountLayout, MintLayout, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { SystemProgram } from "@solana/web3.js";
import Cookies from 'universal-cookie';
import { SmartBuffer } from "../../utils/smartBuffer";


export function set_unity_wallet_connected(isConnected: boolean) {
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

const unityContext = new UnityContext({
  loaderUrl: "unity_build/new_build_8.loader.js",
  dataUrl: "unity_build/new_build_8.data",
  frameworkUrl: "unity_build/new_build_8.framework.js",
  codeUrl: "unity_build/new_build_8.wasm",
  streamingAssetsUrl: "StreamingAssets"
});



export const HomeView = () => {

  onWalletConnectedCallback = async () => {
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) { 
        updateCollection()

        const collectionPublicKey = await PublicKey.createWithSeed(
          wallet.publicKey, //card key
          'SolceryCollection',
          programId,
        );
        connection.onAccountChange(collectionPublicKey, updateCollection)
      }
    }


    return true
  }

  type Brick = {
    Type: number,
    Subtype: number,
    HasField: boolean,
    IntField: number,
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

  const serializeCollection = (collection: Collection, sbuf: SmartBuffer) => {
    sbuf.writeu32(collection.CardTypes.length)
    collection.CardTypes.forEach((cardData) => {
      sbuf.writePublicKey(new PublicKey(cardData.MintAddress))
    })
  }

  const getRuleset = async () => {
    console.log('GET RULESET')
    var cookies = new Cookies()
    console.log('ruleset adress ' + cookies.get('ruleset'))
    const rulesetPointerKey = await PublicKey.createWithSeed(
      new PublicKey(cookies.get('ruleset')), //card key
      'SolceryRuleset',
      programId,
    );
    var rulesetPointerInfo = await connection.getAccountInfo(rulesetPointerKey)
    console.log(rulesetPointerInfo?.data)
    var rulesetAccountKey = new PublicKey(rulesetPointerInfo?.data!)
    var rulesetAccountInfo = await connection.getAccountInfo(rulesetAccountKey)
    var ruleset = deserializeRuleset(new SmartBuffer(rulesetAccountInfo?.data!))
    console.log(ruleset)
    return ruleset;
  }

  const deserializeCollection = async (sbuf: SmartBuffer) => {
    console.log('deserializeCollection')
    console.log(sbuf.buf)
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
        console.log(cardAccInfo?.data)
        var card = deserializeCard(new SmartBuffer(cardAccInfo?.data!))
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

  const serializeRuleset = (ruleset: Ruleset, sbuf: SmartBuffer) => {
    console.log("serializeRuleset")
    console.log(ruleset)
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

  const deserializeRuleset = (sbuf: SmartBuffer) => {
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
    HasField: boolean,
    Slots: number,
  }

  var brickConfigs: BrickConfig[] = [
    //Actions
    { Type: 0, Subtype: 0, HasField: false, Slots: 0, }, //Void
    { Type: 0, Subtype: 1, HasField: false, Slots: 2, }, //Set
    { Type: 0, Subtype: 2, HasField: false, Slots: 3, }, //Conditional
    { Type: 0, Subtype: 3, HasField: false, Slots: 2, }, //Loop
    { Type: 0, Subtype: 4, HasField: true, Slots: 0, }, //Card
    { Type: 0, Subtype: 100, HasField: false, Slots: 1, }, //MoveTo
    { Type: 0, Subtype: 101, HasField: true, Slots: 2, }, //SetPlayerAttr
    { Type: 0, Subtype: 102, HasField: true, Slots: 2, }, //AddPlayerAttr
    { Type: 0, Subtype: 103, HasField: false, Slots: 3, }, //ApplyToPlace

    //Conditions
    { Type: 1, Subtype: 0, HasField: false, Slots: 0, }, //True
    { Type: 1, Subtype: 1, HasField: false, Slots: 0, }, //False
    { Type: 1, Subtype: 2, HasField: false, Slots: 2, }, //Or
    { Type: 1, Subtype: 3, HasField: false, Slots: 2, }, //And
    { Type: 1, Subtype: 4, HasField: false, Slots: 1, }, //Not
    { Type: 1, Subtype: 5, HasField: false, Slots: 2, }, //Equal
    { Type: 1, Subtype: 6, HasField: false, Slots: 2, }, //GreaterThan
    { Type: 1, Subtype: 7, HasField: false, Slots: 2, }, //LesserThan
    { Type: 1, Subtype: 100, HasField: false, Slots: 1, }, //IsAtPlace

    //Values
    { Type: 2, Subtype: 0, HasField: true, Slots: 0, }, //Const,
    { Type: 2, Subtype: 1, HasField: false, Slots: 3, }, //Conditional
    { Type: 2, Subtype: 2, HasField: false, Slots: 2, }, //Add
    { Type: 2, Subtype: 3, HasField: false, Slots: 2, }, //Sub
    { Type: 2, Subtype: 100, HasField: true, Slots: 1, }, //GetPlayerAttr
    { Type: 2, Subtype: 101, HasField: false, Slots: 0, }, //GetPlayerIndex
    { Type: 2, Subtype: 102, HasField: false, Slots: 1, }, //GetCardsAmount
    { Type: 2, Subtype: 103, HasField: false, Slots: 0, }, //CurrentPlace
    { Type: 2, Subtype: 104, HasField: false, Slots: 0, }, //GetCtxVar
    { Type: 2, Subtype: 105, HasField: false, Slots: 0, }, //CasterPlayerIndex

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
      HasField: false,
      Slots: [],
    }
  }

  const serializeBrick = (brick: Brick, buffer: SmartBuffer) => {
    buffer.writeu32(brick.Type)
    buffer.writeu32(brick.Subtype)
    if (brick.HasField) {
      buffer.writeu32(brick.IntField)
    }
    brick.Slots.forEach((slot) => {
      serializeBrick(slot, buffer)
    })
  }

  const serializeCard = (card: Card, buffer: SmartBuffer) => {
    var clientMetadataSize = 16 + card.Metadata.Name.length + card.Metadata.Description.length
    buffer.writeu32(clientMetadataSize)
    buffer.writeu32(card.Metadata.Picture)
    buffer.writeu32(card.Metadata.Coins)
    buffer.writeString(card.Metadata.Name)
    buffer.writeString(card.Metadata.Description)
    serializeBrick(card.BrickTree.Genesis, buffer)

  }

  const deserializeBrick = (buffer: SmartBuffer) => {
    var type = buffer.readu32()
    var subtype = buffer.readu32()
    var config = getBrickConfig(type, subtype)
    var intField = 0
    var slots = []
    if (config.HasField)
      intField = buffer.readu32()
    for (let i = 0; i < config.Slots; i++) {
      slots.push(deserializeBrick(buffer))
    }
    var result: Brick = {
      Type: type,
      Subtype: subtype,
      HasField: config.HasField,
      IntField: intField,
      Slots: slots,
    }
    return result
  }

  const deserializeCard = (buffer: SmartBuffer) => {
    console.log(buffer.buf)
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
    console.log('getCardClientMetaData')
    if (cardData.length <= 0) {
      return {
        Picture: 1,
        Coins: 0,
        Name: "Error",
        Description: "Error",
      }
    }
    var clientMetadataSize = cardData.readUInt32LE(0);
    var buffer = new SmartBuffer(cardData.slice(4, 4 + clientMetadataSize));
    return {
      Picture: buffer.readu32(),
      Coins: buffer.readu32(),
      Name: buffer.readString(),
      Description: buffer.readString(),
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
          unityContext.send("ReactToUnity", "UpdateBoard", JSON.stringify(boardData));            
        }
      }
  }

  const serializeBoardData = async (buf: Buffer) => {
    if (wallet?.publicKey) {
      var playersArray = [];
      var cardsArray = [];
      var cardTypes = [];
      var buffer = new SmartBuffer(buf);
      var players = buffer.readu32()
      for (let i = 0; i < players; i++) {
        var address = buffer.readPublicKey(); 
        playersArray.push({
          Address: address.toBase58(),
          IsActive: Boolean(buffer.readu32()),
          HP: buffer.readu32(),
          Coins: buffer.readu32(),
          IsMe: address.toBase58() == wallet.publicKey.toBase58(),
        })
      }
      var cardTypesAmount = buffer.readu32();
      for (let i = 0; i < cardTypesAmount; i++) {
        cardTypes.push({
          Id: buffer.readu32(),
          MintAddress: buffer.readPublicKey().toBase58(),
          Metadata: getCardClientMetaData(buffer.readBuffer(buffer.readu32())),
        });
      }
      console.log(buffer.buf.slice(buffer.pos, buffer.pos + 100))
      var cards = buffer.readu32()
      for (let i = 0; i < cards; i++) {
        var id = buffer.readu32()
        var cardType = buffer.readu32()
        cardsArray.push({
          CardId: id,
          CardType: cardType,
          CardPlace: buffer.readu32(),
        });
      }
      return {
        Players: playersArray,
        Cards: cardsArray,
        CardTypes: cardTypes,
        EndTurnCardId: 0,
      }
    }
  }

  const addCardToCollection = async(mintAdress: PublicKey) => {
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) { 
        var collection = await getCollection()
        if (collection != undefined) {
          var cookies = new Cookies()
          var myKey = new PublicKey(cookies.get('ruleset'))
          const collectionPublicKey = await PublicKey.createWithSeed(
              myKey, //card key
              'SolceryCollection',
              programId,
            );
          var collectionSize = collection.CardTypes.length + 1
          var sbuf = new SmartBuffer(Buffer.allocUnsafe(4 + collectionSize * 32))
          sbuf.writeu32(collectionSize)
          collection.CardTypes.forEach((cardData) => {
            sbuf.writePublicKey(new PublicKey(cardData.MintAddress))
          })
          sbuf.writePublicKey(mintAdress!)
          return await setPointerAccountData(collectionPublicKey, sbuf.getWritten(), [])
        }
      }
    }
  }

  const createCollection = async () => {
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) { 
        var cookies = new Cookies();
        var accounts: Account[] = [];
        var cookies = new Cookies();
        await createEntity(["Ruleset", "Collection"]).then( async () => {
          if (wallet?.publicKey) {
            var lastEntityKey = new PublicKey(lastEntityMintAdress)
            const rulesetAccountPubkey = await PublicKey.createWithSeed(
              lastEntityKey, //card key
              'SolceryRuleset',
              programId,
            );
            const collectionPublicKey = await PublicKey.createWithSeed(
              lastEntityKey, //card key
              'SolceryCollection',
              programId,
            );
            var rulesetJson = '{"CardMintAddresses":[],"Deck":[{"PlaceId" : 0, "IndexAmount":[]}],"DisplayData":{"PlayerDisplayDatas":[]}}'
            var ruleset: Ruleset = JSON.parse(rulesetJson)
            var sbuf = new SmartBuffer(Buffer.allocUnsafe(2000))
            serializeRuleset(ruleset, sbuf)
            await setPointerAccountData(rulesetAccountPubkey!, sbuf.getWritten(), [])
            var instructions: TransactionInstruction[] = []

            var collectionAccount = new Account();
            var createCollectionAccountIx = SystemProgram.createAccount({
              programId: programId,
              space: 4,
              lamports: await connection.getMinimumBalanceForRentExemption(4, 'singleGossip'),
              fromPubkey: wallet.publicKey,
              newAccountPubkey: collectionAccount.publicKey,
            });
            accounts.push(collectionAccount);
            instructions.push(createCollectionAccountIx);


            const setCollectionAccountDataIx = new TransactionInstruction({
              keys: [
                { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
                { pubkey: collectionAccount.publicKey, isSigner: false, isWritable: true },
              ],
              programId,
              data: Buffer.concat([ Buffer.from([0]), Buffer.from([0, 0, 0, 0]) ]),
            });
            instructions.push(setCollectionAccountDataIx);

            const setCollectionPointerIx = new TransactionInstruction({
              keys: [
                { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
                { pubkey: collectionPublicKey, isSigner: false, isWritable: true },
              ],
              programId,
              data: Buffer.concat([Buffer.from([0]), collectionAccount.publicKey.toBuffer()]),
            });
            instructions.push(setCollectionPointerIx);
            await sendTransaction(connection, wallet, instructions, accounts, true).then( async () =>  {
              var accInfo = await connection.getAccountInfo(new PublicKey(collectionPublicKey));
              var collectionDataPubkey = new PublicKey(accInfo?.data!)
              var collectionData = await connection.getAccountInfo(collectionDataPubkey)
              collection = await deserializeCollection(new SmartBuffer(collectionData?.data!))
              connection.onAccountChange(collectionPublicKey, updateCollection)
              unityContext.send("ReactToUnity", "UpdateCollection", JSON.stringify(collection))
            });
          }
        });
      }
    }
  }

  const getCollection = async() => {
    console.log('getCollection')
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) { 
        var cookies = new Cookies();
        var myStringKey = cookies.get('ruleset')
        if (myStringKey === undefined) {
          createCollection()
          return
        }
        var myKey = new PublicKey(myStringKey)
        const collectionPublicKey = await PublicKey.createWithSeed(
          myKey, //card key
          'SolceryCollection',
          programId,
        );
        var accInfo = await connection.getAccountInfo(collectionPublicKey);
        if (accInfo?.data!) {
          var collectionDataPubkey = new PublicKey(accInfo?.data!)
          var collectionData = await connection.getAccountInfo(collectionDataPubkey)
          var collection = await deserializeCollection(new SmartBuffer(collectionData?.data!))
          collection.RulesetData = await getRuleset()
          unityContext.send("ReactToUnity", "UpdateCollection", JSON.stringify(collection))
          return collection
        } 
        else {
          createCollection()
        }
      } 
    }
  }

  const updateCollection = async() => { // TODO
    unityContext.send("ReactToUnity", "UpdateCollection", JSON.stringify(await getCollection()))
  }

  const getCardKeysFromRuleset = async (ruleset: Ruleset) => {
    var result: {
      pubkey: PublicKey,
      isSigner: boolean,
      isWritable: boolean,
    }[] = []
    for (const mintAddress of ruleset.CardMintAddresses) {
      var cardMintKey = new PublicKey(mintAddress)
      const cardTypePointerKey = await PublicKey.createWithSeed(
        cardMintKey,
        'SolceryCard',
        programId,
      );
      var cardTypePointerData = await connection.getAccountInfo(cardTypePointerKey)
      var cardTypeMetadataKey = new PublicKey(cardTypePointerData?.data!)
      result.push({ pubkey: cardTypePointerKey, isSigner: false, isWritable: false });
      result.push({ pubkey: cardTypeMetadataKey, isSigner: false, isWritable: false });
    }      
    return result
  }
 
  const createBoard = async (rulesetPointerPublicKey: PublicKey) => {
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      console.log('CREATE BOARD')
      if (wallet?.publicKey) { 
        console.log('wallter')
        var rulesetPointerAccountInfo = await connection.getAccountInfo(rulesetPointerPublicKey)
        if (rulesetPointerAccountInfo?.data) {
          console.log('pointer')
          var rulesetAccountKey = new PublicKey(rulesetPointerAccountInfo.data)
          var rulesetAccountInfo = await connection.getAccountInfo(rulesetAccountKey)
          if (rulesetAccountInfo?.data) {
            console.log('EVERYTHING GOOD')

            var data = rulesetAccountInfo.data;
            var ruleset: Ruleset = deserializeRuleset(new SmartBuffer(data));
            var boardAccount = new Account()
            var accounts: Account[] = [];
            var createBoardAccountIx = SystemProgram.createAccount({
              programId: programId,
              space: 23530, // TODO
              lamports: await connection.getMinimumBalanceForRentExemption(23530, 'singleGossip'),
              fromPubkey: wallet.publicKey,
              newAccountPubkey: boardAccount.publicKey,
            });

            accounts.push(boardAccount);
            var instructions = [createBoardAccountIx];
            var keys = [
              { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
              { pubkey: boardAccount.publicKey, isSigner: false, isWritable: true },
              { pubkey: rulesetPointerPublicKey, isSigner: false, isWritable: false },
              { pubkey: rulesetAccountKey, isSigner: false, isWritable: false },
            ]

            for (const mintAddress of ruleset.CardMintAddresses) {
              var cardMintKey = new PublicKey(mintAddress)
              const cardTypePointerKey = await PublicKey.createWithSeed(
                cardMintKey,
                'SolceryCard',
                programId,
              );
              var cardTypePointerData = await connection.getAccountInfo(cardTypePointerKey)
              var cardTypeMetadataKey = new PublicKey(cardTypePointerData?.data!)
              keys.push({ pubkey: cardTypePointerKey, isSigner: false, isWritable: false });
              keys.push({ pubkey: cardTypeMetadataKey, isSigner: false, isWritable: false });
            }    

            const createBoardIx = new TransactionInstruction({
              keys: keys,
              programId,
              data: Buffer.from([2]),
            });
            instructions.push(createBoardIx);

            const joinBoardIx = new TransactionInstruction({
              keys: [
                { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
                { pubkey: boardAccount.publicKey, isSigner: false, isWritable: true },
              ],
              programId,
              data: Buffer.from([3]), // instruction = joinBoard
            });
            instructions.push(joinBoardIx);
            console.log('PRESEND TRAN')
            sendTransaction(connection, wallet, instructions, accounts).then( async () => {
              notify({
                message: "Board started",
                description: "Started board " + boardAccount.publicKey,
              });
              var cookies = new Cookies();
              cookies.set('boardAccountKey', boardAccount.publicKey.toBase58());
              await updateBoard();
              connection.onAccountChange(boardAccount.publicKey, updateBoard)
            }); 
          }
        }
      }
    }
  }
  unityContext.on("CreateBoard", async () => {
    var cookies = new Cookies()
    var myMintKey = new PublicKey(cookies.get('ruleset'))
    const rulesetAccountPubkey = await PublicKey.createWithSeed(
      new PublicKey(myMintKey),
      'SolceryRuleset',
      programId,
    );
    createBoard(rulesetAccountPubkey)
  });

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
        const joinBoardIx = new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
            { pubkey: boardAccountPublicKey, isSigner: false, isWritable: true },
          ],
          programId,
          data: Buffer.from([3]), // instruction = joinBoard
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
  unityContext.on("JoinBoard", (boardAccountKey) => joinBoard(boardAccountKey));

  var connection = useConnection();
  const { wallet, connected, connect, select, provider } = useWallet();
  var connection = useConnection();
  var collection: Collection;

  var lastEntityMintAdress = '';
  var lastEntityAccount: Account[]

  var programId = new PublicKey("5Ds6QvdZAqwVozdu2i6qzjXm8tmBttV6uHNg4YU8rB1P");

  unityContext.on("LogToConsole", (message) => {
    console.log(message);
  });

  unityContext.on("OnUnityLoaded", async () => {
    updateBoard();
    var data = { IsConnected: connected };
    unityContext.send("ReactToUnity", "SetWalletConnected", JSON.stringify(data));
  });

  unityContext.on("OpenLinkInNewTab", (link: string) => {
    window.open(link, "_blank")
  });



  const castCard = async(cardId: number) => {
    console.log('cast card')
    console.log(cardId)
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) {
        const cookies = new Cookies();
        var boardAccountStringKey = cookies.get('boardAccountKey');
        if (boardAccountStringKey) {
          var boardAccountPubkey = new PublicKey(boardAccountStringKey);
          var buf = Buffer.allocUnsafe(5);
          buf.writeUInt8(4, 0); // instruction = cast
          buf.writeUInt32LE(cardId, 1);
          const castIx = new TransactionInstruction({
            keys: [
              { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
              { pubkey: boardAccountPubkey, isSigner: false, isWritable: true },
            ],
            programId,
            data: buf,
          });
          sendTransaction(connection, wallet, [castIx], []).then(async () => {
            updateBoard();
          },
          () => notify({
            message: "Cast card failed",
            description: "reason",
          }));
        }
      }
    }    
  }
  unityContext.on("UseCard", (cardId) => {
    castCard(cardId)
  });

  const updateEntity = async (entityType: string, mintAccountPublicKey: PublicKey, entityData: Buffer) => { 
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) {
        var instructions: TransactionInstruction[] = []
        var accounts: Account[] = [];
        const entityAccountPublicKey = await PublicKey.createWithSeed(
          mintAccountPublicKey,
          'Solcery' + entityType,
          programId,
        );

        setPointerAccountData(entityAccountPublicKey, entityData, accounts)

        sendTransaction(connection, wallet, instructions, accounts, true,
          () => set_unity_card_creation_signed("cardName", true),
          () => set_unity_card_creation_signed("cardName", false)
        ).then(async () => {
          set_unity_card_creation_confirmed("cardName", true);
          notify({
            message: "Card updated",
            description: "Created updated " + entityAccountPublicKey.toBase58(),
          });
        });
      }
    }
  };

  const setPointerAccountData = async (pointerAccountPublicKey: PublicKey, data: Buffer, accounts: Account[]) => {
    if (wallet?.publicKey) {
      var instructions: TransactionInstruction[] = []
      const dataAccount = new Account()
      var createDataAccountIx = SystemProgram.createAccount({
        programId: programId,
        space: data.length,
        lamports: await connection.getMinimumBalanceForRentExemption(data.length, 'singleGossip'),
        fromPubkey: wallet.publicKey,
        newAccountPubkey: dataAccount.publicKey,
      });
      accounts.push(dataAccount);
      instructions.push(createDataAccountIx);

      const setDataAccountDataIx = new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: dataAccount.publicKey, isSigner: false, isWritable: true },
        ],
        programId,
        data: Buffer.concat([ Buffer.from([0]), data]),
      });
      instructions.push(setDataAccountDataIx);

      const setPointerAccountDataIx = new TransactionInstruction({
        keys: [
          { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
          { pubkey: pointerAccountPublicKey, isSigner: false, isWritable: true },
        ],
        programId,
        data: Buffer.concat([Buffer.from([0]), dataAccount.publicKey.toBuffer() ]),
      });
      instructions.push(setPointerAccountDataIx);
     
      await sendTransaction(connection, wallet, instructions, accounts, true)
      
    }
  }

  const createEntity = async (entityTypes: string[]) => {
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) {
        var accounts: Account[] = [];
        var instructions: TransactionInstruction[] = [];

        var mintAccountPublicKey = createUninitializedMint(
          instructions,
          wallet.publicKey,
          await connection.getMinimumBalanceForRentExemption(MintLayout.span, 'singleGossip'),
          accounts
        );

        // Creating mint account on-chain
        var createMintIx = Token.createInitMintInstruction(
          TOKEN_PROGRAM_ID,
          mintAccountPublicKey,
          0,
          wallet.publicKey,
          wallet.publicKey,
        );
        instructions.push(createMintIx);
        lastEntityMintAdress = mintAccountPublicKey.toBase58();

        // Creating token account to hold entity tokens
        let tokenAccountPublicKey = createTokenAccount( //TODO: Associated token?
          instructions, 
          wallet.publicKey, 
          await connection.getMinimumBalanceForRentExemption(AccountLayout.span, 'singleGossip'),
          mintAccountPublicKey,
          wallet.publicKey,
          accounts
        );

        // Minting 1 entity token account
        var mintIx = Token.createMintToInstruction(
          TOKEN_PROGRAM_ID,
          mintAccountPublicKey,
          tokenAccountPublicKey,
          wallet.publicKey,
          [],
          1,
        );
        instructions.push(mintIx);

        // Closing further minting
        var setMintAuthorityIx = Token.createSetAuthorityInstruction(
          TOKEN_PROGRAM_ID,
          mintAccountPublicKey,
          null,
          'MintTokens',
          wallet.publicKey,
          [],
        );
        instructions.push(setMintAuthorityIx);

        for (var i in entityTypes) {
          const entityAccountPublicKey = await PublicKey.createWithSeed(
            mintAccountPublicKey,
            'Solcery' + entityTypes[i],
            programId,
          );
          console.log("Created entity [" + entityTypes[i] + "] account: ", entityAccountPublicKey.toBase58())

          var createCardAccountIx = SystemProgram.createAccountWithSeed({
            fromPubkey: wallet.publicKey,
            basePubkey: mintAccountPublicKey,
            seed: 'Solcery' + entityTypes[i],
            newAccountPubkey: entityAccountPublicKey,
            lamports: await connection.getMinimumBalanceForRentExemption(32, 'singleGossip'),
            space: 32,
            programId: programId,
          });
          instructions.push(createCardAccountIx);
        }
        return await sendTransaction(connection, wallet, instructions, accounts, true).then(() => {
          return mintAccountPublicKey
        })
      }
    }        
  };

  unityContext.on("UpdateCard", async (cardData) =>  {
    var card: Card = JSON.parse(cardData)
    var sbuf = new SmartBuffer(Buffer.allocUnsafe(2000))
    serializeCard(card, sbuf)
    if (card.MintAddress)
    {
      var createdCardMintAdress = new PublicKey(card.MintAddress)
      const entityAccountPublicKey = await PublicKey.createWithSeed(
        createdCardMintAdress,
        'SolceryCard',
        programId,
      );
      await setPointerAccountData(entityAccountPublicKey!, sbuf.getWritten(), [])
    } else {
      await createEntity(["Card"]).then( async () => {
        var createdCardMintAdress = new PublicKey(lastEntityMintAdress)
        const entityAccountPublicKey = await PublicKey.createWithSeed(
          createdCardMintAdress!,
          'SolceryCard',
          programId,
        );
        await setPointerAccountData(entityAccountPublicKey!, sbuf.getWritten(), []).then( async () => {
          await addCardToCollection(createdCardMintAdress!)
        })
      })
    }
  })

  unityContext.on("UpdateRuleset", async (data) =>  {
    var ruleset: Ruleset = JSON.parse(data)
    var sbuf = new SmartBuffer(Buffer.allocUnsafe(2000))
    serializeRuleset(ruleset, sbuf)
    var cookies = new Cookies()
    var mainMintKey = new PublicKey(cookies.get('ruleset'))
    const rulesetPublicKey = await PublicKey.createWithSeed(
      mainMintKey,
      'SolceryRuleset',
      programId,
    );
    await setPointerAccountData(rulesetPublicKey, sbuf.getWritten(), [])
  })

  return (
    <Unity tabIndex={3} style={{ width: '100%', height: '100%' }} unityContext={unityContext} />
  );
 
};
