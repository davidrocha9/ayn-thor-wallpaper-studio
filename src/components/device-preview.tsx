import { ScreenFrame } from '@/components/screen-frame'
import { useStudioContext } from '@/components/studio-context'

export function DevicePreview() {
  const { deviceColor } = useStudioContext()

  return (
    <div className="stage-inner">
      <div className="device" data-device-color={deviceColor}>
        <div className="deck deck-top">
          <div className="lid-glass">
            <ScreenFrame screenKey="top" />
          </div>
        </div>

        <div className="hinge" aria-hidden="true">
          <span className="hinge-barrel" />
        </div>

        <div className="deck deck-bottom">
          <span className="corner-dot corner-dot-left" aria-hidden="true" />
          <span className="corner-dot corner-dot-right" aria-hidden="true" />

          <div className="stick-well well-left" aria-hidden="true">
            <div className="stick" />
          </div>
          <span className="microphone" aria-hidden="true" />
          <svg className="dpad" viewBox="0 0 80 80" aria-hidden="true">
            <path
              className="dpad-face"
              d="M29 3 H51 Q55 3 55 7 V25 H73 Q77 25 77 29 V51 Q77 55 73 55 H55 V73 Q55 77 51 77 H29 Q25 77 25 73 V55 H7 Q3 55 3 51 V29 Q3 25 7 25 H25 V7 Q25 3 29 3 Z"
            />
            <path className="dpad-seams" d="M26 26 34 34 M54 26 46 34 M26 54 34 46 M54 54 46 46" />
            <path className="dpad-marks" d="M38 10 H42 V18 H38 Z M10 38 H18 V42 H10 Z M62 38 H70 V42 H62 Z M38 62 H42 V70 H38 Z" />
          </svg>

          <div className="deck-center">
            <ScreenFrame screenKey="bottom" />
          </div>

          <div className="abxy" aria-hidden="true">
            <i className="abxy-x">X</i>
            <i className="abxy-a">A</i>
            <i className="abxy-y">Y</i>
            <i className="abxy-b">B</i>
          </div>
          <div className="stick-well well-right" aria-hidden="true">
            <div className="stick" />
          </div>

          <span className="system-button-recess" aria-hidden="true" />
          <span className="speaker spk-left" aria-hidden="true" />
          <span className="edge-btn btn-l-outer" aria-hidden="true" />
          <span className="edge-btn btn-l-inner" aria-hidden="true" />
          <span className="ayn-plate" aria-hidden="true">AYN</span>
          <span className="edge-btn btn-r-inner" aria-hidden="true" />
          <span className="edge-btn btn-r-outer" aria-hidden="true" />
          <span className="speaker spk-right" aria-hidden="true" />
        </div>

        <div className="device-front" aria-hidden="true">
          <span className="front-volume" />
          <span className="front-power" />
          <span className="front-usb" />
          <span className="front-audio" />
          <span className="front-card" />
        </div>
        <div className="device-shadow" aria-hidden="true" />
      </div>
    </div>
  )
}
