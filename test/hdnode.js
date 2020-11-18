/* global describe, it, beforeEach */
/* eslint-disable no-new */

var assert = require('assert')
var networks = require('../src/networks')
var sinon = require('sinon')

var BigInteger = require('bigi')
var ECPair = require('../src/ecpair')
var HDNode = require('../src/hdnode')

var fixtures = require('./fixtures/hdnode.json')

describe('HDNode', function () {
  describe('Constructor', function () {
    var keyPair, chainCode

    beforeEach(function () {
      var d = BigInteger.ONE

      keyPair = new ECPair(d, null)
      chainCode = new Buffer(32)
      chainCode.fill(1)
    })

    it('stores the keyPair/chainCode directly', function () {
      var hd = new HDNode(keyPair, chainCode)

      assert.strictEqual(hd.keyPair, keyPair)
      assert.strictEqual(hd.chainCode, chainCode)
    })

    it('has a default depth/index of 0', function () {
      var hd = new HDNode(keyPair, chainCode)

      assert.strictEqual(hd.depth, 0)
      assert.strictEqual(hd.index, 0)
    })

    it('throws on uncompressed keyPair', function () {
      keyPair.compressed = false

      assert.throws(function () {
        new HDNode(keyPair, chainCode)
      }, /BIP32 only allows compressed keyPairs/)
    })

    it('throws when an invalid length chain code is given', function () {
      assert.throws(function () {
        new HDNode(keyPair, chainCode.slice(0, 20))
      }, /Expected chainCode length of 32, got 20/)
    })

    it('throws when an unknown network is given', function () {
      keyPair.network = {}

      assert.throws(function () {
        new HDNode(keyPair, chainCode)
      }, /Unknown BIP32 constants for network/)
    })
  })

  describe('fromSeed*', function () {
    fixtures.valid.forEach(function (f) {
      it('calculates privKey and chainCode for ' + f.master.fingerprint, function () {
        var network = networks[f.network]
        var hd = HDNode.fromSeedHex(f.master.seed, network)

        assert.strictEqual(hd.keyPair.toWIF(), f.master.wif)
        assert.strictEqual(hd.chainCode.toString('hex'), f.master.chainCode)
      })
    })

    it('throws on low entropy seed', function () {
      assert.throws(function () {
        HDNode.fromSeedHex('ffffffffff')
      }, /Seed should be at least 128 bits/)
    })

    it('throws on too high entropy seed', function () {
      assert.throws(function () {
        HDNode.fromSeedHex('ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff')
      }, /Seed should be at most 512 bits/)
    })
  })

  describe('toBase58', function () {
    fixtures.valid.forEach(function (f) {
      it('exports ' + f.master.base58 + ' (public) correctly', function () {
        var network = networks[f.network]
        var hd = HDNode.fromSeedHex(f.master.seed, network).neutered()

        assert.strictEqual(hd.toBase58(), f.master.base58)
      })
    })

    fixtures.valid.forEach(function (f) {
      it('exports ' + f.master.base58Priv + ' (private) correctly', function () {
        var network = networks[f.network]
        var hd = HDNode.fromSeedHex(f.master.seed, network)

        assert.strictEqual(hd.toBase58(), f.master.base58Priv)
      })
    })
  })

  describe('fromBase58', function () {
    fixtures.valid.forEach(function (f) {
      it('imports ' + f.master.base58 + ' (public) correctly', function () {
        var network = networks[f.network]
        var hd = HDNode.fromBase58(f.master.base58)

        assert.strictEqual(hd.toBase58(), f.master.base58)
        assert.strictEqual(hd.keyPair.network, network)
      })
    })

    fixtures.valid.forEach(function (f) {
      it('imports ' + f.master.base58Priv + ' (private) correctly', function () {
        var network = networks[f.network]
        var hd = HDNode.fromBase58(f.master.base58Priv, network)

        assert.strictEqual(hd.toBase58(), f.master.base58Priv)
        assert.strictEqual(hd.keyPair.network, network)
      })
    })

    fixtures.invalid.fromBase58.forEach(function (f) {
      it('throws on ' + f.string, function () {
        assert.throws(function () {
          var network = networks[f.network]

          HDNode.fromBase58(f.string, network)
        }, new RegExp(f.exception))
      })
    })
  })

  describe('getIdentifier', function () {
    var f = fixtures.valid[0]

    it('returns the identifier for ' + f.master.fingerprint, function () {
      var hd = HDNode.fromBase58(f.master.base58)

      assert.strictEqual(hd.getIdentifier().toString('hex'), f.master.identifier)
    })
  })

  describe('getFingerprint', function () {
    var f = fixtures.valid[0]

    it('returns the fingerprint for ' + f.master.fingerprint, function () {
      var hd = HDNode.fromBase58(f.master.base58)

      assert.strictEqual(hd.getFingerprint().toString('hex'), f.master.fingerprint)
    })
  })

  describe('getAddress', function () {
    var hd

    beforeEach(function () {
      var f = fixtures.valid[0]

      hd = HDNode.fromBase58(f.master.base58)
    })

    it('wraps ECPair.getAddress', sinon.test(function () {
      this.mock(hd.keyPair).expects('getAddress')
        .once().returns('foobar')

      assert.strictEqual(hd.getAddress(), 'foobar')
    }))
  })

  describe('neutered', function () {
    var f = fixtures.valid[0]

    it('strips all private information', function () {
      var hd = HDNode.fromBase58(f.master.base58)
      var hdn = hd.neutered()

      assert.strictEqual(hdn.keyPair.d, undefined)
      assert.strictEqual(hdn.keyPair.Q, hd.keyPair.Q)
      assert.strictEqual(hdn.chainCode, hd.chainCode)
      assert.strictEqual(hdn.depth, hd.depth)
      assert.strictEqual(hdn.index, hd.index)
    })
  })

  describe('derive', function () {
    function verifyVector (hd, v, depth) {
      assert.strictEqual(hd.keyPair.toWIF(), v.wif)
      assert.strictEqual(hd.keyPair.getPublicKeyBuffer().toString('hex'), v.pubKey)
      assert.strictEqual(hd.chainCode.toString('hex'), v.chainCode)
      assert.strictEqual(hd.depth, depth || 0)

      if (v.hardened) {
        assert.strictEqual(hd.index, v.m + HDNode.HIGHEST_BIT)
      } else {
        assert.strictEqual(hd.index, v.m)
      }
    }

    fixtures.valid.forEach(function (f) {
      var network = networks[f.network]
      var hd = HDNode.fromSeedHex(f.master.seed, network)

      // FIXME: test data is only testing Private -> private for now
      f.children.forEach(function (c, i) {
        it(c.description + ' from ' + f.master.fingerprint, function () {
          if (c.hardened) {
            hd = hd.deriveHardened(c.m)
          } else {
            hd = hd.derive(c.m)
          }

          verifyVector(hd, c, i + 1)
        })
      })
    })

    it('works for Private -> public (neutered)', function () {
      var f = fixtures.valid[1]
      var c = f.children[0]

      var master = HDNode.fromBase58(f.master.base58Priv)
      var child = master.derive(c.m).neutered()

      assert.strictEqual(child.toBase58(), c.base58)
    })

    it('works for Private -> public (neutered, hardened)', function () {
      var f = fixtures.valid[0]
      var c = f.children[0]

      var master = HDNode.fromBase58(f.master.base58Priv)
      var child = master.deriveHardened(c.m).neutered()

      assert.strictEqual(child.toBase58(), c.base58)
    })

    it('works for Public -> public', function () {
      var f = fixtures.valid[1]
      var c = f.children[0]

      var master = HDNode.fromBase58(f.master.base58)
      var child = master.derive(c.m)

      assert.strictEqual(child.toBase58(), c.base58)
    })

    it('throws on Public -> public (hardened)', function () {
      var f = fixtures.valid[0]
      var c = f.children[0]

      var master = HDNode.fromBase58(f.master.base58)

      assert.throws(function () {
        master.deriveHardened(c.m)
      }, /Could not derive hardened child key/)
    })
  })
})
