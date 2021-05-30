import { Button, Dropdown, Menu } from "antd";
import { ButtonProps } from "antd/lib/button";
import React from "react";
import { LABELS } from "../../constants";
import { useWallet, WalletAdapter } from "../../contexts/wallet";
import { sendTransaction, useConnection } from "../../contexts/connection";
import { Account, Connection, TransactionInstruction, TransactionCtorFields, PublicKey, sendAndConfirmTransaction } from "@solana/web3.js";
// import { transfer } from "@project-serum/serum/lib/token-instructions";
import { SystemProgram, TransferParams } from "@solana/web3.js";
import { publicKey } from "../../utils/layout";

export interface ConnectButtonProps
  extends ButtonProps,
  React.RefAttributes<HTMLElement> {
  allowWalletChange?: boolean;
}

export const ConnectButton = (props: ConnectButtonProps) => {
  const { wallet, connected, connect, select, provider } = useWallet();
  const { onClick, children, disabled, allowWalletChange, ...rest } = props;

  var connection = useConnection();

  // if (wallet?.publicKey) {
  //   const instruction = new TransactionInstruction({
  //     keys: [
  //       { pubkey: wallet?.publicKey, isSigner: true, isWritable: true },
  //       { pubkey: new PublicKey('8YEPH1SR5kEbCKjEx9kQRa8LZimZ2NxPXeYv7hXETM5U'), isSigner: false, isWritable: true },
  //     ],
  //     programId: new PublicKey(
  //       "So11111111111111111111111111111111111111112"
  //     ),
  //     data: Buffer.from([]),
  //   });
  // }

  var account: Account[];
  account = []

  const send = () => {
    console.log('send')

    if (wallet === undefined) {
      console.log('wallet undefined')
    }
    else {
      console.log('sending transaction')

      if (wallet?.publicKey) {
        var transaction_instruction = SystemProgram.transfer({
          fromPubkey: wallet?.publicKey,
          toPubkey: new PublicKey('8YEPH1SR5kEbCKjEx9kQRa8LZimZ2NxPXeYv7hXETM5U'),
          lamports: 100000000,
        });

        var instructions = [ transaction_instruction ]
        sendTransaction(connection, wallet, instructions, account);
      }
    }
  };
  // only show if wallet selected or user connected

  const menu = (
    <Menu>
      <Menu.Item key="3" onClick={select}>
        Change Wallet
      </Menu.Item>
    </Menu>
  );

  if (!provider || !allowWalletChange) {
    return (
      <Button
        {...rest}
        // onClick={connected ? send : send}
        onClick={connected ? onClick : connect}
        disabled={connected && disabled}
      >
        {connected ? LABELS.SEND_LABEL : LABELS.CONNECT_LABEL}
      </Button>
    );
  }

  return (
    <Dropdown.Button
      onClick={connected ? onClick : connect}
      disabled={connected && disabled}
      overlay={menu}
    >
      {LABELS.CONNECT_LABEL}
    </Dropdown.Button>
  );
};
