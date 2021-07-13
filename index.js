const robot = require('robotjs')

const HID = require('node-hid')
const devices = HID.devices()

const PRODUCT_ID = 50770

const MAX_VALUE = 350.0;
const SPEED = 50

const PRESS_THRESHOLD = 0.4
const RELEASE_THRESHOLD = 0.2

const spaceMouses = devices.filter(d=>d.productId === PRODUCT_ID)

let isLeftDown = false
let isRightDown = false

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
      const mouse = robot.getMousePos()
      const moveX = -Math.pow(direction.role, 2) * SPEED * Math.sign(direction.role)
      const moveY = Math.pow(direction.pitch, 2) * SPEED * Math.sign(direction.pitch)
      robot.moveMouse(mouse.x + moveX + 1, mouse.y + moveY + 1)
      // console.log(`x: ${moveX}, y: ${moveY}`)

      // Left click
      if (isLeftDown) {
        if (direction.z <= RELEASE_THRESHOLD) {
          robot.mouseToggle('up')
          isLeftDown = false
          // console.log('left up')
        }
      } else {
        if (direction.z >= PRESS_THRESHOLD) {
          robot.mouseToggle('down')
          isLeftDown = true
          // console.log('left down')
        }
      }
    } else if (data.readInt8(0) == 3) {
      const button = ['release', 'left', 'right'][data.readInt8(1)] ?? 'none'
      // console.log(button)
      if (isRightDown) {
        if (button === 'release') {
          robot.mouseToggle('up', 'right')
          isRightDown = false
          // console.log('right up')
        }
      } else {
        if (button === 'right') {
          robot.mouseToggle('down', 'right')
          isRightDown = true
          // console.log('right down')
        }
      }
    }
  })
  device.on('error', (data) => console.log(data))
})
