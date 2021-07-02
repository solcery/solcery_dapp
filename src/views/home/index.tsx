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
  var buf = Buffer.allocUnsafe(strBytesArray.length );
  for (var i = 0; i < strBytesArray.length; i++) {
    buf.writeUInt8(parseInt(strBytesArray[i]), i);
  }
  return buf
}

const unityContext = new UnityContext({
  loaderUrl: "unity_build/brickconfigs_fix.loader.js",
  dataUrl: "unity_build/brickconfigs_fix.data",
  frameworkUrl: "unity_build/brickconfigs_fix.framework.js",
  codeUrl: "unity_build/brickconfigs_fix.wasm",
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

  readu32() {
    this.pos += 4;
    return this.buf.readUInt32LE(this.pos - 4);;
  }
  writeu32(number: number) {
    this.buf.writeUInt32LE(number, this.pos);
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

  skip(number: number) {
    this.pos += number;
  }
}


export const HomeView = () => {
  var boardCollection : { [id: string] : Object; } = {};

  const buildRulesetFromCookies = () => {
    var cookies = new Cookies();
    var boardName = cookies.get("boardName") 
    var name = 'board.' + boardName;
    var deck = [] 
    var init = []
    var cardTypes = []
    var cardTypesSize = parseInt(cookies.get(name + '.cardTypes.size'))
    for (let i = 0; i < cardTypesSize; i++) {
      cardTypes.push(new PublicKey(cookies.get(name + '.cardTypes.' + i)))
    }
    var deckSize = parseInt(cookies.get(name + '.deck.size'))
    for (let i = 0; i < deckSize; i++) {
      deck.push({
        id: parseInt(cookies.get(name + '.deck.' + i + '.id')),
        amount: parseInt(cookies.get(name + '.deck.' + i + '.amount')),
        place: parseInt(cookies.get(name + '.deck.' + i + '.place')),
      })
    }
    var initSize = parseInt(cookies.get(name + '.init.size'))
    for (let i = 0; i < initSize; i++) {
      init.push(parseInt(cookies.get(name + '.init.' + i)))
    }

    return {
      cardTypes: cardTypes,
      deck: deck,
      init: init,
      clientMetadata: Buffer.from(cookies.get(name + '.clientMetadata')),
    }
  }

  const getCardTypesFromRuleset = (serializedRuleset: Buffer) => {
    var result = []
    var sbuf = new SolanaBuffer(serializedRuleset)
    var cardTypes = sbuf.readu32()
    for (let i = 0; i < cardTypes; i++ ) {
      result.push(sbuf.readPublicKey())
    }
    return result

  }

  const serializeRuleset = (ruleset: {
    cardTypes: PublicKey[],
    deck: { id: number; amount: number; place: number; }[],
    init: number[],
    clientMetadata: Buffer
  }) => {
    var cardTypesSize = 4 + ruleset.cardTypes.length * 32;
    var deckSize = 4 + ruleset.deck.length * 12
    var initSize = 4 + ruleset.init.length * 4
    var clientMetadataSize = 4 + ruleset.clientMetadata.length
    var bufferSize = cardTypesSize + deckSize + initSize + clientMetadataSize
    var sbuf = new SolanaBuffer(Buffer.allocUnsafe(bufferSize))
    sbuf.writeu32(ruleset.cardTypes.length);
    ruleset.cardTypes.forEach((element) => {
      sbuf.writePublicKey(element);
    })
    // for (let i = 0; i < ruleset.cardTypes.length; i++) {
    //   sbuf.writePublicKey(ruleset.cardTypes[i])
    // }

    sbuf.writeu32(ruleset.deck.length);
    ruleset.deck.forEach((element) => {
      sbuf.writeu32(element.place);
      sbuf.writeu32(element.id);
      sbuf.writeu32(element.amount);
    })

    sbuf.writeu32(ruleset.init.length);
    ruleset.init.forEach((element) => {
      sbuf.writeu32(element);
    })
    sbuf.writeu32(ruleset.clientMetadata.length)
    sbuf.writeBuffer(ruleset.clientMetadata)
    console.log(sbuf.buf)
    return sbuf.buf;
  }

  const getCardClientMetaData = (cardData: Buffer) => {
    console.log('getCardClientMetaData')
    if (cardData.length <= 0) {
      return {
        Picture: 1,
        Name: "Error",
        Description: "Error",
      }
    }
    var clientMetadataSize = cardData.readUInt32LE(0);
    var buffer = new SolanaBuffer(cardData.slice(4, 4 + clientMetadataSize));
    return {
      Picture: buffer.readu32(),
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
          console.log("UpdateBoard")
          console.log(buf)
          var boardData = await serializeBoardData(buf);
          unityContext.send("ReactToUnity", "UpdateBoard", JSON.stringify(boardData));            
        }
      }
  }

  const serializeBoardData = async (buf: Buffer) => {
    if (wallet?.publicKey) {
      console.log("GET BOT DATA")
      var playersArray = [];
      var cardsArray = [];
      var cardTypes = [];
      var buffer = new SolanaBuffer(buf);
      console.log(buffer.buf)
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
          MintAddress: cardTypes[cardType].MintAddress,
          Metadata: cardTypes[cardType].Metadata,
        });
      }
      return {
        Players: playersArray,
        Cards: cardsArray,
        EndTurnCardId: 0,
      }
    }
  }

  const getCollection = async() => { // TODO
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) { 
        const collectionPublicKey = await PublicKey.createWithSeed(
          wallet.publicKey, //card key
          'COLLECTION',
          programId,
        );
        var accInfo = await connection.getAccountInfo(new PublicKey(lastEntityMintAdress));
        if (accInfo?.data) {
          var sbuf = new SolanaBuffer(accInfo.data)
          // decode collection
          let cardsAmount = sbuf.readu32()
          var cards: string[] = [];
          var boards: string[] = [];
          for (let i = 0; i < cardsAmount; i++) {
            cards.push(sbuf.readPublicKey().toBase58());
          }
          return {
            cards: cards,
          };  
        } 
      }
    }
  }

  const addCardToCollection = async(mintAdress: PublicKey) => {
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) { 
       
      }
    }
  }

  const createBoard = async (rulesetPointerPublicKey: PublicKey) => {
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) { 
        var rulesetPointerAccountInfo = await connection.getAccountInfo(rulesetPointerPublicKey)
        if (rulesetPointerAccountInfo?.data) {
          var rulesetAccountKey = new PublicKey(rulesetPointerAccountInfo.data)
          var rulesetAccountInfo = await connection.getAccountInfo(rulesetAccountKey)
          if (rulesetAccountInfo?.data) {
            console.log('EVERYTHING GOOD')

            var data = rulesetAccountInfo.data;
            console.log(data)
            var cardTypes = getCardTypesFromRuleset(data); 
            console.log(cardTypes)
            var boardAccount = new Account()
            var accounts: Account[];
            accounts = []
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
            cardTypes.forEach( async (cardTypePointerKey) => {
              var cardTypePointerData = await connection.getAccountInfo(cardTypePointerKey)
              var cardTypeMetadataKey = new PublicKey(cardTypePointerData?.data!)
              keys.push({ pubkey: cardTypePointerKey, isSigner: false, isWritable: false });
              keys.push({ pubkey: cardTypeMetadataKey, isSigner: false, isWritable: false });
            })

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
    }
  }
  unityContext.on("CreateBoard", createBoard);

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
          data: Buffer.from([2]), // instruction = joinBoard
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
  const { marketEmitter, midPriceInUSD } = useMarkets();
  const { tokenMap } = useConnectionConfig();
  const SRM_ADDRESS = 'SRMuApVNdxXokk5GT7XD5cUUgXMBCoAz2LHeuAoKWRt';
  const SRM = useUserBalance(SRM_ADDRESS);
  const SOL = useUserBalance(WRAPPED_SOL_MINT);
  const { balanceInUSD: totalBalanceInUSD } = useUserTotalBalance();
  const { wallet, connected, connect, select, provider } = useWallet();
  var connection = useConnection();
  var lastEntityMintAdress = '';

  var programId = new PublicKey("5Ds6QvdZAqwVozdu2i6qzjXm8tmBttV6uHNg4YU8rB1P");

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



  const castCard = async(cardId: number) => {
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
          buf.writeUInt8(3, 0); // instruction = cast
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
  unityContext.on("UseCard", (cardAccountKey, cardId) =>  castCard(cardId));

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

        var oldCardAcc = await connection.getAccountInfo(entityAccountPublicKey);
        if (oldCardAcc?.data) {
          var oldCardMetadataPublicKey = new PublicKey(oldCardAcc.data);
          const cleatOldMetadataIx = new TransactionInstruction({
            keys: [
              { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
              { pubkey: oldCardMetadataPublicKey, isSigner: false, isWritable: true },
            ],
            programId,
            data: Buffer.from([1]), // instruction = delete entity
          });
          instructions.push(cleatOldMetadataIx);
        }

        var entityMetadataAccount = new Account();
        var createCardMetadataAccountIx = SystemProgram.createAccount({
          programId: programId,
          space: entityData.length,
          lamports: await connection.getMinimumBalanceForRentExemption(entityData.length, 'singleGossip'),
          fromPubkey: wallet.publicKey,
          newAccountPubkey: entityMetadataAccount.publicKey,
        });
        accounts.push(entityMetadataAccount);
        instructions.push(createCardMetadataAccountIx);

        const setCardMetadataIx = new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
            { pubkey: entityMetadataAccount.publicKey, isSigner: false, isWritable: true },
          ],
          programId,
          data: Buffer.concat([ Buffer.from([0]), entityData ]),
        });
        instructions.push(setCardMetadataIx);

        const setEntityPointerIx = new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
            { pubkey: entityAccountPublicKey, isSigner: false, isWritable: true },
          ],
          programId,
          data: Buffer.concat([Buffer.from([0]), entityMetadataAccount.publicKey.toBuffer()]),
        });
        instructions.push(setEntityPointerIx);

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
  unityContext.on("UpdateCard",  (cardAccountKey, cardData, cardName) =>  updateEntity("Card", new PublicKey(cardAccountKey), joinedBufferToBuffer(cardData))); // TODO: args

  const createEntity = async (entityType: string, entityData: Buffer) => {
    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      if (wallet?.publicKey) {
        console.log("CreateEntity")
        console.log(entityData)
        var accounts: Account[];
        accounts = [];
        var instructions: TransactionInstruction[] = []

        // Creating mint account
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

        var entityMetadataAccount = new Account();
        var createEntityMetadataAccountIx = SystemProgram.createAccount({
          programId: programId,
          space: entityData.length,
          lamports: await connection.getMinimumBalanceForRentExemption(entityData.length, 'singleGossip'),
          fromPubkey: wallet.publicKey,
          newAccountPubkey: entityMetadataAccount.publicKey,
        });
        accounts.push(entityMetadataAccount);
        instructions.push(createEntityMetadataAccountIx);

        const setEntityMetadataIx = new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
            { pubkey: entityMetadataAccount.publicKey, isSigner: false, isWritable: true },
          ],
          programId,
          data: Buffer.concat([ Buffer.from([0]), entityData]),
        });
        instructions.push(setEntityMetadataIx);

        const entityAccountPublicKey = await PublicKey.createWithSeed(
          mintAccountPublicKey,
          'Solcery' + entityType,
          programId,
        );

        var createCardAccountIx = SystemProgram.createAccountWithSeed({
          fromPubkey: wallet.publicKey,
          basePubkey: mintAccountPublicKey,
          seed: 'Solcery' + entityType,
          newAccountPubkey: entityAccountPublicKey,
          lamports: await connection.getMinimumBalanceForRentExemption(32, 'singleGossip'),
          space: 32,
          programId: programId,
        });
        instructions.push(createCardAccountIx);

        const setCardPointerIx = new TransactionInstruction({
          keys: [
            { pubkey: wallet.publicKey, isSigner: true, isWritable: false },
            { pubkey: entityAccountPublicKey, isSigner: false, isWritable: true },
          ],
          programId,
          data: Buffer.concat([Buffer.from([0]), entityMetadataAccount.publicKey.toBuffer() ]),
        });
        instructions.push(setCardPointerIx);

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
  unityContext.on("CreateCard", createEntity);

  const init = () => {
    document.getElementById('new_card')!.onclick = async () => {
      var cardData = Buffer.from([ 15, 0, 0, 0, 43, 0, 0, 0, 2, 0, 0, 0, 84, 101, 1, 0, 0, 0, 85, 0, 0, 0, 0, 0, 0, 0, 0 ]);
      await createEntity("Card", cardData);
    }
    document.getElementById('update_card')!.onclick = async () => {
      var cardData = Buffer.from([0, 0, 0, 0, 1, 0, 0 ,0]);
      var lastEntityKey = new PublicKey(lastEntityMintAdress)
      updateEntity("Card", lastEntityKey, cardData);
    }
    document.getElementById('new_ruleset')!.onclick = async () => {
      var ruleset = buildRulesetFromCookies();
      var rulesetData = serializeRuleset(ruleset);
      console.log("serialized ruleset")
      console.log(rulesetData)
      await createEntity("Ruleset", rulesetData);
      console.log(lastEntityMintAdress)
    }
    document.getElementById('update_ruleset')!.onclick = async () => {
      var ruleset = buildRulesetFromCookies();
      var rulesetData = serializeRuleset(ruleset);
      var lastEntityKey = new PublicKey(lastEntityMintAdress)
      await updateEntity("Ruleset", lastEntityKey, rulesetData);
    }
    document.getElementById('new_board')!.onclick = async () => {
      var lastEntityKey = new PublicKey(lastEntityMintAdress)
      const rulesetAccountPublicKey = await PublicKey.createWithSeed(
        lastEntityKey,
        'SolceryRuleset',
        programId,
      );
      await createBoard(rulesetAccountPublicKey);
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

  );
 
  
};
