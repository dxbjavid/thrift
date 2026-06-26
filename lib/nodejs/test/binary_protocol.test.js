/*
 * Licensed to the Apache Software Foundation (ASF) under one
 * or more contributor license agreements. See the NOTICE file
 * distributed with this work for additional information
 * regarding copyright ownership. The ASF licenses this file
 * to you under the Apache License, Version 2.0 (the
 * "License"); you may not use this file except in compliance
 * with the License. You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing,
 * software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
 * KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations
 * under the License.
 */

const test = require("tape");
const thrift = require("thrift");
const TFramedTransport = require("thrift/lib/nodejs/lib/thrift/framed_transport");
const TBinaryProtocol = require("thrift/lib/nodejs/lib/thrift/binary_protocol");

const NEGATIVE_SIZE = thrift.Thrift.TProtocolExceptionType.NEGATIVE_SIZE;

// Wrap a payload in a single Thrift frame.
function frame(payload) {
  const f = Buffer.alloc(4 + payload.length);
  f.writeInt32BE(payload.length, 0);
  payload.copy(f, 4);
  return f;
}

// Hand the payload to a framed receiver and read it back with a
// TBinaryProtocol, returning whatever the supplied reader function produces.
function readBack(payload, read) {
  let result;
  const onData = TFramedTransport.receiver(
    function (reader) {
      result = read(new TBinaryProtocol(reader));
    },
    undefined,
    1 << 20,
  );
  onData(frame(payload));
  return result;
}

// A negative size is encoded as an i32 with the sign bit set (0xFFFFFFFF = -1).
const NEG = Buffer.from([0xff, 0xff, 0xff, 0xff]);
const STRING = 0x0b; // TType.STRING

// Assert that reading "payload" with "read" raises a NEGATIVE_SIZE protocol
// exception rather than handing back the negative count.
function assertRejectsNegative(assert, payload, read) {
  let thrown;
  try {
    readBack(payload, read);
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown, "an exception was raised");
  assert.equal(thrown && thrown.type, NEGATIVE_SIZE);
}

const cases = {
  "readMapBegin rejects a negative size": function (assert) {
    const payload = Buffer.concat([Buffer.from([STRING, STRING]), NEG]);
    assertRejectsNegative(assert, payload, (p) => p.readMapBegin());
    assert.end();
  },

  "readListBegin rejects a negative size": function (assert) {
    const payload = Buffer.concat([Buffer.from([STRING]), NEG]);
    assertRejectsNegative(assert, payload, (p) => p.readListBegin());
    assert.end();
  },

  "readSetBegin rejects a negative size": function (assert) {
    const payload = Buffer.concat([Buffer.from([STRING]), NEG]);
    assertRejectsNegative(assert, payload, (p) => p.readSetBegin());
    assert.end();
  },

  "readListBegin still accepts a valid size": function (assert) {
    const payload = Buffer.from([STRING, 0x00, 0x00, 0x00, 0x02]);
    const list = readBack(payload, (p) => p.readListBegin());
    assert.equal(list.etype, STRING);
    assert.equal(list.size, 2);
    assert.end();
  },
};

Object.keys(cases).forEach(function (name) {
  test(name, cases[name]);
});
