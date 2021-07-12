import { PublicKey } from "@solana/web3.js";

export class SmartBuffer {
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
}