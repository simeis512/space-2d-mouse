const robot = require('robotjs')

const HID = require('node-hid')
const devices = HID.devices()

const PRODUCT_ID = 50770

const MAX_VALUE = 350.0;
const SPEED = 100.0

const PUSH_THRESHOLD = 0.3
const PUSH_RELEASE_THRESHOLD = 0.2

const spaceMouses = devices.filter(d=>d.productId === PRODUCT_ID)

const decimal = { x: 0.0, y: 0.0 }

let isPushDown = false
let isStable = false

let isLeftBurronDown = false
let isRightBurronDown = false


spaceMouses.forEach((spaceMouse) => {
  const device = new HID.HID(spaceMouse.path)

  device.on('data', async (data) => {
    // console.log(data)
    if (data.readInt8(0) == 1) {
      const direction = {
        x: data.readInt16LE(1) / MAX_VALUE,
        y: data.readInt16LE(3) / MAX_VALUE,
        z: data.readInt16LE(5) / MAX_VALUE,
        pitch: data.readInt16LE(7) / MAX_VALUE,
        role: data.readInt16LE(9) / MAX_VALUE,
        yaw: data.readInt16LE(11) / MAX_VALUE,
      }
      // console.log(direction)

      // Move
      if (!isStable) {
        const mouse = robot.getMousePos()
        const move = {
          x: -Math.pow(direction.role, 3) * SPEED,
          y: Math.pow(direction.pitch, 3) * SPEED
        }
        const integer = { x: 0, y: 0 }
        Array('x', 'y').forEach((v) => {
          decimal[v] += move[v] % 1.0
          integer[v] = decimal[v] - decimal[v] % 1.0
          decimal[v] = decimal[v] % 1.0
        })
        robot.moveMouse(
          mouse.x + move.x + integer.x + 1,
          mouse.y + move.y + integer.y + 1
        )
        // console.log(`x: ${move.x}, y: ${move.y}`)
      }

      // Left click
      if (isPushDown) {
        if (direction.z <= PUSH_RELEASE_THRESHOLD) {
          robot.mouseToggle('up')
          isPushDown = false
          // console.log('left up')
        }
      } else {
        if (direction.z >= PUSH_THRESHOLD) {
          robot.mouseToggle('down')
          isPushDown = true
          isStable = true
          setTimeout(() => isStable = false, 200)
          // console.log('left down')
        }
      }
    } else if (data.readInt8(0) == 3) {
      const button = ['release', 'left', 'right'][data.readInt8(1)] ?? 'none'
      // console.log(button)
      if (isLeftBurronDown) {
        if (button === 'release') {
          robot.mouseToggle('up', 'middle')
          isLeftBurronDown = false
          // console.log('middle up')
        }
      } else {
        if (button === 'left') {
          robot.mouseToggle('down', 'middle')
          isLeftBurronDown = true
          // console.log('middle down')
        }
      }
      if (isRightBurronDown) {
        if (button === 'release') {
          robot.mouseToggle('up', 'right')
          isRightBurronDown = false
          // console.log('right up')
        }
      } else {
        if (button === 'right') {
          robot.mouseToggle('down', 'right')
          isRightBurronDown = true
          // console.log('right down')
        }
      }
    }
  })
  device.on('error', (data) => console.log(data))
})
