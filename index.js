const robot = require('robotjs')

const HID = require('node-hid')
const devices = HID.devices()

const PRODUCT_ID = 50770

const MAX_VALUE = 350.0;

const MOUSE_SPEED = 100.0

const PUSH_THRESHOLD = 0.3
const PUSH_RELEASE_THRESHOLD = 0.2
const PUSH_STABLE_DURATION = 200

const PULL_THRESHOLD = -0.9
const PULL_RELEASE_THRESHOLD = -0.6

const SLIDE_THRESHOLD = 0.7
const SLIDE_RELEASE_THRESHOLD = 0.7
const SLIDE_HOLD_DURATION = 300

const SCROLL_THRESHOLD = 0.2
const SCROLL_SPEED = 200.0

const spaceMouses = devices.filter(d=>d.productId === PRODUCT_ID)

const decimal = { x: 0.0, y: 0.0 }

let isPushDown = false
let isStable = false

let isPullUp = false

const slideStatus = {
  left: {
    isSliding: false,
    isHolded: false,
    holdTimeout: null,
    axis: '-x',
  },
  top: {
    isSliding: false,
    isHolded: false,
    holdTimeout: null,
    axis: '-y',
  },
  right: {
    isSliding: false,
    isHolded: false,
    holdTimeout: null,
    axis: 'x',
  },
  bottom: {
    isSliding: false,
    isHolded: false,
    holdTimeout: null,
    axis: 'y',
  },
}

const slideKeys = {
  left: {
    pulse: {
      key: 'left',
      modifier: 'alt',
    },
    hold: {
      key: 'pageup',
      modifier: 'control',
    }
  },
  top: {
    pulse: {
      key: 'pageup',
    },
    hold: {
      key: 't',
      modifier: ['control', 'shift'],
    }
  },
  right: {
    pulse: {
      key: 'right',
      modifier: 'alt',
    },
    hold: {
      key: 'pagedown',
      modifier: 'control',
    }
  },
  bottom: {
    pulse: {
      key: 'pagedown',
    },
    hold: {
      key: 'w',
      modifier: 'control',
    }
  },
}

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

      // Scroll
      const isScrolling = Math.abs(direction.yaw) >= SCROLL_THRESHOLD
      if (isScrolling) {
        robot.scrollMouse(0, -Math.pow(direction.yaw, 3) * SCROLL_SPEED);
      }

      // slide
      Array('left', 'top', 'right', 'bottom').forEach((dir) => {
        const sign = slideStatus[dir].axis.includes('-') ? -1 : 1
        const axis = slideStatus[dir].axis.slice(-1)
        if (slideStatus[dir].isSliding) {
          if (direction[axis] * sign <= SLIDE_RELEASE_THRESHOLD) {
            if (!slideStatus[dir].isHolded) {
              clearTimeout(slideStatus[dir].holdTimeout)
              if (!slideKeys[dir].pulse.modifier) {
                robot.keyTap(slideKeys[dir].pulse.key)
              } else {
                robot.keyTap(slideKeys[dir].pulse.key, slideKeys[dir].pulse.modifier)
              }
              // console.log('slide ${dir}: ${slideKeys[dir].pulse.key} ${slideKeys[dir].pulse.modifier})
            }
            slideStatus[dir].isSliding = false
          }
        } else {
          if (direction[axis] * sign >= SLIDE_THRESHOLD && !isScrolling) {
            slideStatus[dir].isSliding = true
            slideStatus[dir].isHolded = false
            clearTimeout(slideStatus[dir].holdTimeout)
            slideStatus[dir].holdTimeout = setTimeout(() => {
              robot.keyTap(slideKeys[dir].hold.key, slideKeys[dir].hold.modifier ?? null)
              slideStatus[dir].isHolded = true
              // console.log('hold ${dir}: ${slideKeys[dir].hold.key} ${slideKeys[dir].hold.modifier})
            }, SLIDE_HOLD_DURATION)
          }
        }  
      })

      const isSliding = Array('left', 'top', 'right', 'bottom').some((dir) => slideStatus[dir].isSliding)

      // Move
      if (!isStable && !isScrolling && !isSliding) {
        const mouse = robot.getMousePos()
        const move = {
          x: -Math.pow(direction.role, 3) * MOUSE_SPEED,
          y: Math.pow(direction.pitch, 3) * MOUSE_SPEED
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
        if (direction.z >= PUSH_THRESHOLD && !isScrolling && !isSliding) {
          robot.mouseToggle('down')
          isPushDown = true
          isStable = true
          setTimeout(() => isStable = false, PUSH_STABLE_DURATION)
          // console.log('left down')
        }
      }

      // F5
      if (isPullUp) {
        if (direction.z >= PULL_RELEASE_THRESHOLD) {
          robot.keyTap('f5')
          isPullUp = false
          // console.log('left up')
        }
      } else {
        if (direction.z <= PULL_THRESHOLD && !isScrolling && !isSliding) {
          isPullUp = true
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
