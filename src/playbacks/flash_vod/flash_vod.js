// Copyright 2014 Globo.com Player authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

var UIObject = require('../../base/ui_object')
var Styler = require('../../base/styler')
var JST = require('../../base/jst')
var Mediator = require('../../components/mediator')
var _ = require("underscore")

var objectIE = '<object type="application/x-shockwave-flash" id="<%= cid %>" classid="clsid:d27cdb6e-ae6d-11cf-96b8-444553540000" data-flash-vod=""><param name="movie" value="<%= swfPath %>"> <param name="quality" value="autohigh"> <param name="swliveconnect" value="true"> <param name="allowScriptAccess" value="always"> <param name="bgcolor" value="#001122"> <param name="allowFullScreen" value="false"> <param name="wmode" value="transparent"> <param name="tabindex" value="1"> </object>'

class FlashVOD extends UIObject {
  get name() { return 'flash_vod' }
  get tagName() { return 'object' }
  get template() { return JST.flash_vod }

  initialize(options) {
    this.src = options.src
    this.swfPath = options.swfPath || "assets/Player.swf"
    this.autoPlay = options.autoPlay
    this.settings = {
      left: ["playpause"],
      default: ["position", "seekbar", "duration"],
      right: ["fullscreen", "volume"]
    }
    this.isReady = false
    this.checkIfFlashIsReady()
  }

  safe(fn) {
    if(this.el.getState && this.el.getDuration && this.el.getPosition && this.el.getBytesLoaded && this.el.getBytesTotal) {
      return fn.apply(this)
    }
  }

  bootstrap() {
    clearInterval(this.bootstrapId)
    this.el.width = "100%"
    this.el.height = "100%"
    this.el.setPlaybackId(this.uniqueId)
    this.addListeners()
    this.isReady = true
    this.trigger('playback:ready', this.name)
    this.currentState = "IDLE"
  }

  checkIfFlashIsReady() {
    this.bootstrapId = setInterval(() => {
      if(this.el.getState && this.el.getState() === "IDLE") {
        this.bootstrap()
      }
    }, 500)
  }

  setupFirefox() {
    var $el = this.$('embed')
    $el.attr('data-flash-vod', '')
    this.setElement($el[0])
  }

  getPlaybackType() {
    return "vod"
  }

  updateTime() {
    this.safe(() => {
      this.trigger('playback:timeupdate', this.el.getPosition(), this.el.getDuration(), this.name)
    })
  }

  addListeners() {
    Mediator.on(this.uniqueId + ':progress', () => this.progress())
    Mediator.on(this.uniqueId + ':timeupdate', () => this.updateTime())
    Mediator.on(this.uniqueId + ':statechanged', () => this.checkState())
  }

  stopListening() {
    super()
    Mediator.off(this.uniqueId + ':progress')
    Mediator.off(this.uniqueId + ':timeupdate')
    Mediator.off(this.uniqueId + ':statechanged')
  }

  checkState() {
    this.safe(() => {
      if (this.currentState !== "PLAYING_BUFFERING" && this.el.getState() === "PLAYING_BUFFERING") {
        this.trigger('playback:buffering', this.name)
        this.currentState = "PLAYING_BUFFERING"
      } else if (this.currentState === "PLAYING_BUFFERING" && this.el.getState() === "PLAYING") {
        this.trigger('playback:bufferfull', this.name)
        this.currentState = "PLAYING"
      } else if (this.el.getState() === "IDLE") {
        this.currentState = "IDLE"
      } else if (this.el.getState() === "ENDED") {
        this.trigger('playback:ended', this.name)
        this.trigger('playback:timeupdate', 0, this.el.getDuration(), this.name)
        this.currentState = "ENDED"
      }
    })
  }

  progress() {
    this.safe(() => {
      if (this.currentState !== "IDLE" && this.currentState !== "ENDED") {
        this.trigger('playback:progress', 0, this.el.getBytesLoaded(), this.el.getBytesTotal(), this.name)
      }
    })
  }

  firstPlay() {
    this.safe(() => {
      this.currentState = "PLAYING"
      this.el.playerPlay(this.src)
    })
  }

  play() {
    this.safe(() => {
      if(this.el.getState() === 'PAUSED') {
        this.currentState = "PLAYING"
        this.el.playerResume()
      } else if (this.el.getState() !== 'PLAYING') {
        this.firstPlay()
      }
      this.trigger('playback:play', this.name)
    })
  }

  volume(value) {
    this.safe(() => {
      this.el.playerVolume(value)
    })
  }

  pause() {
    this.safe(() => {
      this.currentState = "PAUSED"
      this.el.playerPause()
    })
  }

  stop() {
    this.safe(() => {
      this.el.playerStop()
      this.trigger('playback:timeupdate', 0, this.name)
    })
  }

  isPlaying() {
    return !!(this.isReady && this.currentState == "PLAYING")
  }

  getDuration() {
    return this.safe(() => {
      return this.el.getDuration()
    })
  }

  seek(time) {
    this.safe(() => {
      var seekTo = this.el.getDuration() * (time / 100)
      this.el.playerSeek(seekTo)
      this.trigger('playback:timeupdate', seekTo, this.el.getDuration(), this.name)
      if (this.currentState == "PAUSED") {
        this.pause()
      }
    })
  }

  destroy() {
    clearInterval(this.bootstrapId)
    this.stopListening()
    this.$el.remove()
  }

  setupIE() {
    this.setElement($(_.template(objectIE)({cid: this.cid, swfPath: this.swfPath})))
  }

  render() {
    var style = Styler.getStyleFor(this.name)
    this.$el.html(this.template({cid: this.cid, swfPath: this.swfPath}))
    this.$el.append(style)
    if(navigator.userAgent.match(/firefox/i)) { //FIXME remove it from here
      this.setupFirefox()
    } else if(window.ActiveXObject) {
      this.setupIE()
    }
    return this
  }
}

FlashVOD.canPlay = function(resource) {
  //http://help.adobe.com/en_US/flashmediaserver/techoverview/WS07865d390fac8e1f-4c43d6e71321ec235dd-7fff.html
  if (navigator.userAgent.match(/firefox/i) || window.ActiveXObject) {
    return _.isString(resource) && !!resource.match(/(.*).(mp4|mov|f4v|3gpp|3gp)/)
  } else {
    return _.isString(resource) && !!resource.match(/(.*).(mov|f4v|3gpp|3gp)/)
  }
}

module.exports = FlashVOD