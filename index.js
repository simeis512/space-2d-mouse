const robot = require('robotjs')

const HID = require('node-hid')
const devices = HID.devices()

const PRODUCT_ID = 50770

const MAX_VALUE = 350.0;

const MOUSE_MOVE_THRESHOLD = 0.1
const MOUSE_SPEED = 100.0

const PUSH_THRESHOLD = 0.3
const PUSH_RELEASE_THRESHOLD = 0.2
const PUSH_STABLE_DURATION = 200
const LONG_PUSH_DURATION = 600

const PULL_THRESHOLD = -0.9
const PULL_RELEASE_THRESHOLD = -0.6

const SLIDE_THRESHOLD = 0.7
const SLIDE_RELEASE_THRESHOLD = 0.7
const SLIDE_HOLD_DURATION = 200

const SCROLL_THRESHOLD = 0.2
const SCROLL_SPEED = 200.0

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

const spaceMouses = devices.filter(d=>d.productId === PRODUCT_ID)

const mouseDecimal = { x: 0.0, y: 0.0 }
const scrollDecimal = { x: 0.0, y: 0.0 }

let isPushDown = false
let isStable = false
let longPushTimeout = null
let isShortPush = false
let isMoved = false

let isPullUp = false

let isLeftBurronDown = false
let isRightBurronDown = false

let isSliding = false
let isScrolling = false
let isMouseMoving = false

let isToolEnabled = true
let isSpecialPulling = false
let isSpecialRelease = true


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

      // slide
      Array('left', 'top', 'right', 'bottom').forEach((dir) => {
        const sign = slideStatus[dir].axis.includes('-') ? -1 : 1
        const axis = slideStatus[dir].axis.slice(-1)
        if (slideStatus[dir].isSliding) {
          if (direction[axis] * sign <= SLIDE_RELEASE_THRESHOLD) {
            if (!slideStatus[dir].isHolded) {
              clearTimeout(slideStatus[dir].holdTimeout)
              keyTap(slideKeys[dir].pulse.key, slideKeys[dir].pulse.modifier)
              // console.log('slide ${dir}: ${slideKeys[dir].pulse.key} ${slideKeys[dir].pulse.modifier})
            }
            slideStatus[dir].isSliding = false
          }
        } else {
          if (direction[axis] * sign >= SLIDE_THRESHOLD) {
            slideStatus[dir].isSliding = true
            slideStatus[dir].isHolded = false
            clearTimeout(slideStatus[dir].holdTimeout)
            slideStatus[dir].holdTimeout = setTimeout(() => {
              keyTap(slideKeys[dir].hold.key, slideKeys[dir].hold.modifier)
              slideStatus[dir].isHolded = true
              // console.log('hold ${dir}: ${slideKeys[dir].hold.key} ${slideKeys[dir].hold.modifier})
            }, SLIDE_HOLD_DURATION)
          }
        }  
      })

      isSliding = Array('left', 'top', 'right', 'bottom').some((dir) => slideStatus[dir].isSliding)

      // Twist
      if (!isMouseMoving) {
        isScrolling = Math.abs(direction.yaw) >= SCROLL_THRESHOLD && !isSliding
        if (isScrolling) {
          const scroll = {
            x: 0,
            y: -Math.pow(direction.yaw, 3) * SCROLL_SPEED,
          }
          const integer = { x: 0, y: 0 }
          Array('x', 'y').forEach((v) => {
            scrollDecimal[v] += scroll[v] % 1.0
            integer[v] = scrollDecimal[v] - scrollDecimal[v] % 1.0
            scrollDecimal[v] = scrollDecimal[v] % 1.0
          })
          scrollMouse(
            integer.x,
            scroll.y + integer.y
          );
        }
      }

      // Tilt
      if (!isStable && !isScrolling && !isSliding) {
        const move = {
          x: -Math.pow(direction.role, 3) * MOUSE_SPEED,
          y: Math.pow(direction.pitch, 3) * MOUSE_SPEED
        }
        const integer = { x: 0, y: 0 }
        Array('x', 'y').forEach((v) => {
          mouseDecimal[v] += move[v] % 1.0
          integer[v] = mouseDecimal[v] - mouseDecimal[v] % 1.0
          mouseDecimal[v] = mouseDecimal[v] % 1.0
        })
        moveMouse(
          move.x + integer.x,
          move.y + integer.y
        )
        const d = direction.role * direction.role + direction.pitch * direction.pitch
        isMouseMoving = d >= MOUSE_MOVE_THRESHOLD * MOUSE_MOVE_THRESHOLD
        // console.log(`x: ${move.x}, y: ${move.y}`)
      }

      // Push
      if (isPushDown) {
        if (direction.z <= PUSH_RELEASE_THRESHOLD) {
          clearTimeout(longPushTimeout)
          if (isShortPush) {
            mouseClick()
          }
          if (isMoved) {
            mouseToggle('up', 'left')
          }
          isPushDown = false
          isShortPush = false
          // console.log('left up')
        }
      } else {
        if (direction.z >= PUSH_THRESHOLD && !isScrolling && !isSliding) {
          isPushDown = true
          isStable = true
          setTimeout(() => isStable = false, PUSH_STABLE_DURATION)
          isShortPush = true
          longPushTimeout = setTimeout(() => {
            isShortPush = false
            mouseClick('right')
          }, LONG_PUSH_DURATION)
          isMoved = false
          // console.log('left down')
        }
      }
      if (isShortPush && isMouseMoving) {
        clearTimeout(longPushTimeout)
        isShortPush = false
        isMoved = true
        mouseToggle('down', 'left')
      }

      // Pull
      if (isPullUp) {
        if (direction.z >= PULL_RELEASE_THRESHOLD) {
          keyTap('f5')
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
      const leftBit = 0b01;
      const rightBit = 0b10;
      const button = data.readInt8(1)
      // console.log(button)
      if (isLeftBurronDown) {
        if (!(button & leftBit)) {
          mouseToggle('up', 'middle')
          isLeftBurronDown = false
          // console.log('middle up')
        }
      } else {
        if (button & leftBit) {
          mouseToggle('down', 'middle')
          isLeftBurronDown = true
          // console.log('middle down')
        }
      }
      if (isRightBurronDown) {
        if (!(button & rightBit)) {
          mouseToggle('up', 'right')
          isRightBurronDown = false
          // console.log('right up')
        }
      } else {
        if (button & rightBit) {
          mouseToggle('down', 'right')
          isRightBurronDown = true
          // console.log('right down')
        }
      }
    }

    // console.log(isLeftBurronDown, isRightBurronDown, isPullUp)
    if (isSpecialRelease && isLeftBurronDown && isRightBurronDown && isPullUp) {
      isToolEnabled = !isToolEnabled
      isSpecialPulling = true
      isSpecialRelease = false
    }
    if (isSpecialPulling && !(isLeftBurronDown || isRightBurronDown || isPullUp)) {
      isSpecialPulling = false
      isSpecialRelease = true
    }
    // console.log(`enabled: ${isToolEnabled}, pulling: ${isSpecialPulling}, release: ${isSpecialRelease}`)
  })
  device.on('error', (data) => console.log(data))
})

function moveMouse(moveX, moveY) {
  if (!isToolEnabled || isSpecialPulling) return
  const mouse = robot.getMousePos()
  robot.moveMouse(
    mouse.x + moveX + 1,
    mouse.y + moveY + 1
  )
}

function mouseToggle(down, button) {
  if (!isToolEnabled || isSpecialPulling) return
  if (!button) {
    robot.mouseToggle(down)
  } else {
    robot.mouseToggle(down, button)
  }
}

function mouseClick(button) {
  if (!isToolEnabled || isSpecialPulling) return
  if (!button) {
    robot.mouseClick()
  } else {
    robot.mouseClick(button)
  }
}

function scrollMouse(x, y) {
  if (!isToolEnabled || isSpecialPulling) return
  robot.scrollMouse(x, y);
}

function keyTap(key, modifier) {
  if (!isToolEnabled || isSpecialPulling) return
  if (!modifier) {
    robot.keyTap(key)
  } else {
    robot.keyTap(key, modifier)
  }
}
