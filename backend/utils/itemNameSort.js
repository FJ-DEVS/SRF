// "Item A–Z" sorts for any list keyed on an item name like "1001 SF - 0.8mm":
// with the serial number (1001, 1002 … in number order), or without it, so
// every "SF - 0.8mm" groups together with its serials in order.
// Keep the keys in step with ITEM_NAME_SORT_OPTIONS in the admin app.

// Aggregation stages that derive the sort keys from a name expression: the
// name lowercased with runs of spaces collapsed (some names carry doubles),
// then split into the leading serial ("1001") and the rest ("sf - 0.8mm").
// A name with no serial keeps all of it as the rest; a missing one sorts last.
const itemNameKeyStages = (nameExpr) => [
  {
    $addFields: {
      _itemName: {
        $reduce: {
          input: { $split: [{ $toLower: { $ifNull: [nameExpr, ''] } }, ' '] },
          initialValue: '',
          in: {
            $cond: [
              { $eq: ['$$this', ''] },
              '$$value',
              { $concat: ['$$value', { $cond: [{ $eq: ['$$value', ''] }, '', ' '] }, '$$this'] }
            ]
          }
        }
      }
    }
  },
  { $addFields: { _serial: { $regexFind: { input: '$_itemName', regex: /^(\d+) (.*)$/ } } } },
  {
    $addFields: {
      _hasItem: { $cond: [{ $eq: ['$_itemName', ''] }, 0, 1] },
      _hasSerial: { $cond: [{ $ne: ['$_serial', null] }, 1, 0] },
      _itemSerial: { $toLong: { $arrayElemAt: ['$_serial.captures', 0] } },
      _itemNoSerial: { $ifNull: [{ $arrayElemAt: ['$_serial.captures', 1] }, '$_itemName'] }
    }
  }
];

const ITEM_NAME_SORTS = {
  item_asc: { _hasItem: -1, _hasSerial: -1, _itemSerial: 1, _itemNoSerial: 1 },
  item_noserial_asc: { _hasItem: -1, _itemNoSerial: 1, _itemSerial: 1 }
};

// The helper fields the stages add, for dropping them before a response
const ITEM_NAME_SORT_FIELDS = ['_itemName', '_serial', '_hasItem', '_hasSerial', '_itemSerial', '_itemNoSerial'];

module.exports = { itemNameKeyStages, ITEM_NAME_SORTS, ITEM_NAME_SORT_FIELDS };
