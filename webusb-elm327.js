let device = null

const VENDOR_READ_REQUEST = 0x01
const VENDOR_WRITE_REQUEST = 0x01
const SET_LINE_REQUEST = 0x20
const SET_CONTROL_REQUEST = 0x22

const buf2hex = (buf) => Array.prototype.map.call(new Uint8Array(buf), x => ('00' + x.toString(16)).slice(-2)).join('')
const hex2buf = (hex) => new Uint8Array(hex.match(/[\da-f]{2}/gi).map(h => parseInt(h, 16)))
const hex2ascii = (hex) => {
  let str = ''
  for (let i = 0; i < hex.length; i += 2) {
    str += String.fromCharCode(parseInt(hex.substr(i, 2), 16))
  }
  return str
}
const ascii2hex = (str) => {
  let arr = []
  for (let i = 0, l = str.length; i < l; i ++) {
    arr.push(Number(str.charCodeAt(i)).toString(16).padStart(2, '0'))
  }
  return arr.join('')
}
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const vendorRead = (device, value, index, length) => {
  return device.controlTransferIn({
    requestType: 'vendor',
    recipient: 'device',
    request: VENDOR_READ_REQUEST,
    value,
    index
  }, length)
}

const vendorWrite = (device, value, index) => {
  return device.controlTransferOut({
    requestType: 'vendor',
    recipient: 'device',
    request: VENDOR_WRITE_REQUEST,
    value,
    index
  }, new ArrayBuffer(0))
}

const setLine = (device, value, index, data) => {
  return device.controlTransferOut({
    requestType: 'class',
    recipient: 'interface',
    request: SET_LINE_REQUEST,
    value,
    index
  }, data)
}

const setControl = (device, value, index) => {
  return device.controlTransferOut({
    requestType: 'class',
    recipient: 'interface',
    request: SET_CONTROL_REQUEST,
    value,
    index
  }, new ArrayBuffer(0))
}

const setupDevice = async (device) => {
  await vendorRead(device, 0x8484, 0x0000, 1)
  await vendorWrite(device, 0x404, 0x0000)
  await vendorRead(device, 0x8484, 0x0000, 1)
  await vendorRead(device, 0x8383, 0x0000, 1)
  await vendorRead(device, 0x8484, 0x0000, 1)
  await vendorWrite(device, 0x404, 0x0001)
  await vendorRead(device, 0x8484, 0x0000, 1)
  await vendorRead(device, 0x8383, 0x0000, 1)
  await vendorWrite(device, 0x0, 0x0001)
  await vendorWrite(device, 0x1, 0x0000)
  await vendorWrite(device, 0x2, 0x0044)
  await vendorRead(device, 0x80, 0x0000, 2)
  await vendorWrite(device, 0x0, 0x0001)
  await setControl(device, 0x1, 0x0000)
  await vendorRead(device, 0x80, 0x0000, 2)
  await vendorWrite(device, 0x0, 0x0001)
  await setControl(device, 0x3, 0x0000)
  await vendorRead(device, 0x80, 0x0000, 2)
  await vendorWrite(device, 0x0, 0x0001)
  await vendorRead(device, 0x80, 0x0000, 2)
  await vendorWrite(device, 0x0, 0x0001)
  await vendorWrite(device, 0xB0B, 0x0002)
  await vendorWrite(device, 0x909, 0x0000)
  await vendorWrite(device, 0x808, 0x0000)
  await setLine(device, 0x0, 0x0000, hex2buf('00960000000007'))
  await setControl(device, 0x1, 0x0000)
  await setControl(device, 0x0, 0x0000)
  await setLine(device, 0x0, 0x0000, hex2buf('00960000000008'))
  await vendorWrite(device, 0x505, 0x1311)
  await setControl(device, 0x0, 0x0000)
  await setControl(device, 0x0, 0x0000)
  await vendorRead(device, 0x80, 0x0000, 2)
  await vendorWrite(device, 0x0, 0x0001)
}

const send = async (device, frame) => {
  console.log(frame)
  const endpoint = device.configuration.interfaces[0].alternates[0].endpoints.find(e => e.direction === 'out' && e.type === 'bulk')
  const endpointNumber = endpoint.endpointNumber
  const result = await device.transferOut(endpointNumber, frame)
  if (result.status !== 'ok' || result.bytesWritten !== frame.length) {
    throw new Error('Write error')
  }
  return result
}

const readLoop = async (device, maxFrameLength, cb) => {
  const endpoint = device.configuration.interfaces[0].alternates[0].endpoints.find(e => e.direction === 'in' && e.type === 'bulk')
  const endpointNumber = endpoint.endpointNumber
  const result = await device.transferIn(endpointNumber, maxFrameLength)
  if (result.status !== 'ok') {
    throw new Error('Read error')
  }
  cb(new Uint8Array(result.data.buffer))
  readLoop(device, maxFrameLength, cb)
}

const initDevice = async () => {
  const device = await navigator.usb.requestDevice({
    filters: [
      {
        vendorId: 0x067B,
        productId: 0x2303
      }
    ]
  })
  await device.open()
  const [ configuration ] = device.configurations
  if (device.configuration === null) {
    await device.selectConfiguration(configuration.configurationValue)
  }
  await device.claimInterface(configuration.interfaces[0].interfaceNumber)
  await device.selectAlternateInterface(configuration.interfaces[0].interfaceNumber, 0)
  return device
}

const log = (frame) => {
  const last1000Lines = document.querySelector('#logs').value.split('\n').slice(0, 1000).join('\n')
  document.querySelector('#logs').value = `${frame}\n${last1000Lines}`
}

const initEvents = () => {
  document.querySelector('#open').addEventListener('click', async () => {
    try {
      device = await initDevice()
      await setupDevice(device)
      document.querySelector('#status').innerHTML = `status: connected (${device.productName})`
      let frame = []
      readLoop(device, 256, (chunk) => {
        for (let i = 0; i < chunk.length; ++i) {
          if (chunk[i] === 0x0D) {
            if (frame.length) {
              log(hex2ascii(buf2hex(frame)))
            }
            frame = []
          } else {
            frame.push(chunk[i])
          }
        }
      })
    } catch (err) {
      console.error(err)
      alert(err)
    }
  })

  document.querySelector('#close').addEventListener('click', async () => {
    try {
      await device.close()
      device = null
      document.querySelector('#status').innerHTML = 'status: not connected'
    } catch (err) {
      alert(err)
    }
  })

  document.querySelector('#send').addEventListener('click', async () => {
    await send(device, hex2buf(ascii2hex(`${document.querySelector('#input').value}\r`)))
    document.querySelector('#input').value = ''
  })
}

initEvents()
