/*
 * Copyright 2016 Google Inc. All rights reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
'use strict';

(function() {
  var Marzipano = window.Marzipano;
  var bowser = window.bowser;
  var screenfull = window.screenfull;
  var data = window.APP_DATA;

  // Grab elements from DOM.
  var panoElement = document.querySelector('#pano');
  var sceneNameElement = document.querySelector('#titleBar .sceneName');
  var sceneListElement = document.querySelector('#sceneList');
  var sceneElements = document.querySelectorAll('#sceneList .scene');
  var sceneListToggleElement = document.querySelector('#sceneListToggle');
  var autorotateToggleElement = document.querySelector('#autorotateToggle');
  var fullscreenToggleElement = document.querySelector('#fullscreenToggle');

  // Detect desktop or mobile mode.
  if (window.matchMedia) {
    var setMode = function() {
      if (mql.matches) {
        document.body.classList.remove('desktop');
        document.body.classList.add('mobile');
      } else {
        document.body.classList.remove('mobile');
        document.body.classList.add('desktop');
      }
    };
    var mql = matchMedia("(max-width: 500px), (max-height: 500px)");
    setMode();
    mql.addListener(setMode);
  } else {
    document.body.classList.add('desktop');
  }

  // Detect whether we are on a touch device.
  document.body.classList.add('no-touch');
  window.addEventListener('touchstart', function() {
    document.body.classList.remove('no-touch');
    document.body.classList.add('touch');
  });

  // Use tooltip fallback mode on IE < 11.
  if (bowser.msie && parseFloat(bowser.version) < 11) {
    document.body.classList.add('tooltip-fallback');
  }

  // Viewer options.
  var viewerOpts = {
    controls: {
      mouseViewMode: data.settings.mouseViewMode
    }
  };

  // Initialize viewer.
  var viewer = new Marzipano.Viewer(panoElement, viewerOpts);

  // Create scenes.
  var scenes = data.scenes.map(function(data) {
    var urlPrefix = "tiles";
    var source = Marzipano.ImageUrlSource.fromString(
      urlPrefix + "/" + data.id + "/{z}/{f}/{y}/{x}.jpg",
      { cubeMapPreviewUrl: urlPrefix + "/" + data.id + "/preview.jpg" });
    var geometry = new Marzipano.CubeGeometry(data.levels);

    var limiter = Marzipano.RectilinearView.limit.traditional(data.faceSize, 100*Math.PI/180, 120*Math.PI/180);
    var view = new Marzipano.RectilinearView(data.initialViewParameters, limiter);

    var scene = viewer.createScene({
      source: source,
      geometry: geometry,
      view: view,
      pinFirstLevel: true
    });

    // Create link hotspots.
    data.linkHotspots.forEach(function(hotspot) {
      var element = createLinkHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    // Create info hotspots.
    data.infoHotspots.forEach(function(hotspot) {
      var element = createInfoHotspotElement(hotspot);
      scene.hotspotContainer().createHotspot(element, { yaw: hotspot.yaw, pitch: hotspot.pitch });
    });

    return {
      data: data,
      scene: scene,
      view: view
    };
  });

  // Set up autorotate, if enabled.
  var autorotate = Marzipano.autorotate({
    yawSpeed: 0.03,
    targetPitch: 0,
    targetFov: Math.PI/2
  });
  if (data.settings.autorotateEnabled) {
    autorotateToggleElement.classList.add('enabled');
  }

  // Set handler for autorotate toggle.
  autorotateToggleElement.addEventListener('click', toggleAutorotate);

  // Set up fullscreen mode, if supported.
  if (screenfull.enabled && data.settings.fullscreenButton) {
    document.body.classList.add('fullscreen-enabled');
    fullscreenToggleElement.addEventListener('click', function() {
      screenfull.toggle();
    });
    screenfull.on('change', function() {
      if (screenfull.isFullscreen) {
        fullscreenToggleElement.classList.add('enabled');
      } else {
        fullscreenToggleElement.classList.remove('enabled');
      }
    });
  } else {
    document.body.classList.add('fullscreen-disabled');
  }

  // Set handler for scene list toggle.
  sceneListToggleElement.addEventListener('click', toggleSceneList);

  // Start with the scene list open on desktop.
  if (!document.body.classList.contains('mobile')) {
    showSceneList();
  }

  // Set handler for scene switch.
  scenes.forEach(function(scene) {
    var el = document.querySelector('#sceneList .scene[data-id="' + scene.data.id + '"]');
    el.addEventListener('click', function() {
      switchScene(scene);
      // On mobile, hide scene list after selecting a scene.
      if (document.body.classList.contains('mobile')) {
        hideSceneList();
      }
    });
  });

  // DOM elements for view controls.
  var viewUpElement = document.querySelector('#viewUp');
  var viewDownElement = document.querySelector('#viewDown');
  var viewLeftElement = document.querySelector('#viewLeft');
  var viewRightElement = document.querySelector('#viewRight');
  var viewInElement = document.querySelector('#viewIn');
  var viewOutElement = document.querySelector('#viewOut');

  // Dynamic parameters for controls.
  var velocity = 0.7;
  var friction = 3;

  // Associate view controls with elements.
  var controls = viewer.controls();
  controls.registerMethod('upElement',    new Marzipano.ElementPressControlMethod(viewUpElement,     'y', -velocity, friction), true);
  controls.registerMethod('downElement',  new Marzipano.ElementPressControlMethod(viewDownElement,   'y',  velocity, friction), true);
  controls.registerMethod('leftElement',  new Marzipano.ElementPressControlMethod(viewLeftElement,   'x', -velocity, friction), true);
  controls.registerMethod('rightElement', new Marzipano.ElementPressControlMethod(viewRightElement,  'x',  velocity, friction), true);
  controls.registerMethod('inElement',    new Marzipano.ElementPressControlMethod(viewInElement,  'zoom', -velocity, friction), true);
  controls.registerMethod('outElement',   new Marzipano.ElementPressControlMethod(viewOutElement, 'zoom',  velocity, friction), true);

  function sanitize(s) {
    return s.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;');
  }

  //Need to store it here so it won't refresh every time an info hotspot is created (when it is clicked)
  var previousHotspot = null;

  function switchScene(scene) {
    stopAutorotate();
    scene.view.setParameters(scene.data.initialViewParameters);
    scene.scene.switchTo();
    startAutorotate();
    var previousSceneName = document.querySelector('#titleBar .sceneName').innerHTML;
    console.log("\n\npreviousSceneName: ", previousSceneName, "\n\n")
    updateSceneName(scene);
    updateSceneList(scene);
    
    // Show audio and audio transcript buttons only in rooms with audio
    var sceneName = document.querySelector('#titleBar .sceneName').innerHTML;
    var audioBtn = document.getElementById("soundPlay");
    var audioTextBtn = document.getElementById("audiotxt-btn");
    var audioTextBox = document.getElementById("audio-transcript");
    var audioTxt = document.getElementById("audio-txt-paragraph")
    console.log('\nSceneName switched to : ' + sceneName + "\n");
    if(["Girl\'s Bedchamber", "Dr. Samuel Martin\'s Bedchamber", "Family Parlor", "Study", "Hewlett Guest Room" ].includes(sceneName)) {
      console.log("\n\nScene changed to a room with audio\n\n")
      audioBtn.style.display = ""; 
      audioTextBtn.style.display = "";
      audioTextBox.style.display = "";
    } else {
      audioBtn.style.display = "none"; 
      audioTextBtn.style.display = "none";
      audioTextBox.style.display = "none";
    }
    // set audio text to an empty string every time the user changes the room/scene
    audioTxt.innerHTML = "";
    audioTextBox.style.display = "none";

    //For any scene change, pause and reset all audio elements 
    if(previousSceneName != sceneName) {
      var girlsBedchamberAudio = document.getElementById("Girls-audio");
      var samuelAudio = document.getElementById("Samuel-audio");
      var familyParlorAudio = document.getElementById("Parlor-audio");
      var studyAudio = document.getElementById("Study-audio");
      var hewlettAudio = document.getElementById("Hewlett-audio");
      var audioArr = [girlsBedchamberAudio, samuelAudio, familyParlorAudio, studyAudio, hewlettAudio];
      for (var i = 0; i < audioArr.length; i=i+1) {
        audioArr[i].pause();
        audioArr[i].currentTime = 0;
      }
      //Reset all image hotspot elements
      var imageWrapper = document.getElementById('image-wrapper');
      imageWrapper.classList.toggle("visible", false);
      resetHotSpotValues(imageWrapper);
    }
    
  }

  function updateSceneName(scene) {
    sceneNameElement.innerHTML = sanitize(scene.data.name);
  }

  function updateSceneList(scene) {
    for (var i = 0; i < sceneElements.length; i++) {
      var el = sceneElements[i];
      if (el.getAttribute('data-id') === scene.data.id) {
        el.classList.add('current');
      } else {
        el.classList.remove('current');
      }
    }
  }

  function showSceneList() {
    sceneListElement.classList.add('enabled');
    sceneListToggleElement.classList.add('enabled');
  }

  function hideSceneList() {
    sceneListElement.classList.remove('enabled');
    sceneListToggleElement.classList.remove('enabled');
  }

  function toggleSceneList() {
    sceneListElement.classList.toggle('enabled');
    sceneListToggleElement.classList.toggle('enabled');
  }

  function startAutorotate() {
    if (!autorotateToggleElement.classList.contains('enabled')) {
      return;
    }
    viewer.startMovement(autorotate);
    viewer.setIdleMovement(3000, autorotate);
  }

  function stopAutorotate() {
    viewer.stopMovement();
    viewer.setIdleMovement(Infinity);
  }

  function toggleAutorotate() {
    if (autorotateToggleElement.classList.contains('enabled')) {
      autorotateToggleElement.classList.remove('enabled');
      stopAutorotate();
    } else {
      autorotateToggleElement.classList.add('enabled');
      startAutorotate();
    }
  }

  function createLinkHotspotElement(hotspot) {

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('link-hotspot');

    // Create image element.
    var icon = document.createElement('img');
    icon.src = 'img/link.png';
    icon.classList.add('link-hotspot-icon');

    // Set rotation transform.
    var transformProperties = [ '-ms-transform', '-webkit-transform', 'transform' ];
    for (var i = 0; i < transformProperties.length; i++) {
      var property = transformProperties[i];
      icon.style[property] = 'rotate(' + hotspot.rotation + 'rad)';
    }

    // Add click event handler.
    wrapper.addEventListener('click', function() {
      switchScene(findSceneById(hotspot.target));
      console.log(findSceneById(hotspot.target).data.name);
    });

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    // Create tooltip element.
    var tooltip = document.createElement('div');
    tooltip.classList.add('hotspot-tooltip');
    tooltip.classList.add('link-hotspot-tooltip');
    tooltip.innerHTML = findSceneDataById(hotspot.target).name;

    wrapper.appendChild(icon);
    wrapper.appendChild(tooltip);

    return wrapper;
  }

  function createInfoHotspotElement(hotspot) {

    // Create wrapper element to hold icon and tooltip.
    var wrapper = document.createElement('div');
    wrapper.classList.add('hotspot');
    wrapper.classList.add('info-hotspot');

    // Create hotspot/tooltip header.
    var header = document.createElement('div');
    header.classList.add('info-hotspot-header');

    // Create image element.
    var iconWrapper = document.createElement('div'); 
    iconWrapper.classList.add('info-hotspot-icon-wrapper');
    var icon = document.createElement('img');
    icon.src = 'img/info.png';
    icon.classList.add('info-hotspot-icon');
    iconWrapper.appendChild(icon);

    // Create title element.
    var titleWrapper = document.createElement('div');
    titleWrapper.classList.add('info-hotspot-title-wrapper');
    var title = document.createElement('div');
    title.classList.add('info-hotspot-title');
    title.innerHTML = hotspot.title;
    titleWrapper.appendChild(title);

    // Create close element.
    var closeWrapper = document.createElement('div');
    closeWrapper.classList.add('info-hotspot-close-wrapper');
    var closeIcon = document.createElement('img');
    closeIcon.src = 'img/close.png';
    closeIcon.classList.add('info-hotspot-close-icon');
    closeWrapper.appendChild(closeIcon);

    // Construct header element.
    header.appendChild(iconWrapper);
    header.appendChild(titleWrapper);
    header.appendChild(closeWrapper);

    // Create text element.
    var text = document.createElement('div');
    text.classList.add('info-hotspot-text');
    text.innerHTML = hotspot.text;

    // check if img src exists
    if (hotspot.hasOwnProperty("img_src")) {
      var img_src = document.createElement('div'); 
      img_src.classList.add('info-hotspot-image-wrapper');
      var img_property = document.createElement('img');
      img_property.src = hotspot.img_src;
      img_property.classList.add('info-hotspot-image');
      img_src.appendChild(img_property);
      //if image exists, append to text elem
      // var modal = document.createElement("div");
      // img_src.onclick = function(){
      //   modal.style.display = "block";
      // }
      // var button = document.createElement("button");
      // var span = document.createElement("span");
      // span.innerHTML = "&times;";
      // button.data_close = true;
      // span.onclick = function() {
      //   modal.style.display = "none";
      // }
      // button.appendChild(span);
      // modal.appendChild(button);
      // document.body.appendChild(modal);
      text.appendChild(img_src);
    }

    // Place header into wrapper element.
    wrapper.appendChild(header);
    // place text into wrapper element
    wrapper.appendChild(text);

    // Create a modal for the hotspot content to appear on mobile mode.
    var modal = document.createElement('div');
    modal.innerHTML = wrapper.innerHTML;
    modal.classList.add('info-hotspot-modal');
    document.body.appendChild(modal);

    var toggle = function() {
      wrapper.classList.toggle('visible');
      modal.classList.toggle('visible');
    };

    //Only exists within this function- remember that!
    var imageWrapper = document.getElementById('image-wrapper');
    var bodyContainer = imageWrapper.querySelector('.body-container');

    var headerCloseIcon = imageWrapper.querySelector('.header-close');
    headerCloseIcon.src ="img/close.png";

    // Show content when hotspot is clicked.
    wrapper.querySelector('.info-hotspot-header').addEventListener('click', function() {
      //hotspot = refers to desktop version of hotspot info
      //modal = referst to mobile version of hotspot info (fade in one rather than drop down)
      //Used to modify how things should appear on various devices
      //visible- used to toggle on/off the various visible subclasses of CSS elements
      //When creating elements, need to have an parent HTML element that child element can attach itself to
      console.log("BEFORE CLICK!");
      if(previousHotspot === null) {
        console.log("Previous Hotspot is: NULL");
      }
      else {
        console.log("Previous Hotspot is:"+previousHotspot.title);
      }
      console.log("Current Hotspot is:"+hotspot.title);

      //If audio transcript box is currently open, close it
      var audiotxt = document.getElementById("audio-txt-paragraph");
      if(audiotxt.innerHTML) {
        audiotxt.innerHTML = "";
      }
      
      //If hotspot being clicked on is the same one that the user clicked on before, just toggle it, else update values to new hotspot
      if(previousHotspot !== null && previousHotspot.title === hotspot.title) {
        document.getElementById("image-wrapper").classList.toggle("visible");
      }
      else {
        //At this point, either clicking on a hotspot for the first time or clicking on a different one compared to the last
        //Reset info from previous hotspot
        console.log(imageWrapper);
        resetHotSpotValues(imageWrapper);
      
        //At this point, image wrapper should have default values- now get updated info
        var headerText = imageWrapper.querySelector('.header-text');
        headerText.innerHTML = hotspot.title;

        //Setting up content of body of hotspot
        var imageElement = bodyContainer.querySelector(".body-image");
        if(hotspot.hasOwnProperty("img_src")) {
          imageWrapper.style.top = "10%";
          bodyContainer.classList.replace("body-container", "body-container-image");
          imageElement = bodyContainer.querySelector(".body-image");
          imageElement.src = hotspot.img_src
        }

        var bodyText = bodyContainer.getElementsByClassName("body-text")[0];
        bodyText.innerHTML = hotspot.text;
        
        previousHotspot = hotspot;
        document.getElementById("image-wrapper").classList.toggle("visible", true);
        
        console.log("AFTER CLICK!");
        if(previousHotspot === null) {
          console.log("Previous Hotspot is: NULL");
        }
        else {
          console.log("Previous Hotspot is:"+previousHotspot.title);
        }
          console.log("Current Hotspot is:"+hotspot.title);
        }              
    });

    document.body.querySelector(".header-close").addEventListener("click", function() {
      imageWrapper.classList.toggle("visible", false);
    })

    // Hide content when close icon is clicked.
    modal.querySelector(".info-hotspot-close-wrapper").addEventListener("click", toggle);

    // Prevent touch and scroll events from reaching the parent element.
    // This prevents the view control logic from interfering with the hotspot.
    stopTouchAndScrollEventPropagation(wrapper);

    return wrapper;
  }

  function getBodyContainer(imageWrapper) {
    var bodyContainer = imageWrapper.querySelector('.body-container-image');
    if(bodyContainer === null) {
      return imageWrapper.querySelector('.body-container');
    }
    else {
      return imageWrapper.querySelector('.body-container-image');
    }
  }

  function resetHotSpotValues(imageWrapper) {
    imageWrapper.style.top = "25%";
    var headerText = imageWrapper.querySelector('.header-text');
    headerText.innerHTML = "";
    var bodyContainer = getBodyContainer(imageWrapper);
    console.log(bodyContainer);
    if(bodyContainer.className === "body-container-image") {
      bodyContainer.classList.replace("body-container-image", "body-container");
      var imageElement = bodyContainer.querySelector(".body-image");
      imageElement.src = "";   
    }
    else {
      var bodyText = bodyContainer.querySelector('.body-text');
      bodyText.innerHTML = "";
    }
  }

  // Prevent touch and scroll events from reaching the parent element.
  function stopTouchAndScrollEventPropagation(element, eventList) {
    var eventList = [ 'touchstart', 'touchmove', 'touchend', 'touchcancel',
                      'wheel', 'mousewheel' ];
    for (var i = 0; i < eventList.length; i++) {
      element.addEventListener(eventList[i], function(event) {
        event.stopPropagation();
      });
    }
  }

  function findSceneById(id) {
    for (var i = 0; i < scenes.length; i++) {
      if (scenes[i].data.id === id) {
        return scenes[i];
      }
    }
    return null;
  }

  function findSceneDataById(id) {
    for (var i = 0; i < data.scenes.length; i++) {
      if (data.scenes[i].id === id) {
        return data.scenes[i];
      }
    }
    return null;
  }


  // play/pause audio button functionality
  var playAudioButton = document.getElementById("soundPlay");
  var audio;
  var checkAudioInterval;
  var currentScene;
  // var audioPlaying = false;
  playAudioButton.addEventListener("click", function() {
    
    var sceneName = document.querySelector('#titleBar .sceneName').innerHTML;
    // Play the corresponding audio based on the current scene.
    switch (sceneName) {
      case 'Girl\'s Bedchamber':
        audio = document.getElementById("Girls-audio");
        // Set an interval to check the current time of the audio and pause it if needed
        checkAudioInterval = setInterval(function() {

          if (audio.currentTime >= pauseTime) {
            audio.pause();
            clearInterval(checkAudioInterval);
          }
        }, 100); // check every 100 milliseconds 
        audio.paused ? audio.play() : audio.pause();
        console.log("Playing audio for " + sceneName);
        console.log("Audio paused? " + audio.paused);        
        break;
      case 'Dr. Samuel Martin\'s Bedchamber':
        audio = document.getElementById("Samuel-audio");
        checkAudioInterval = setInterval(function() {
          if (audio.currentTime >= pauseTime) {
            audio.pause();
            clearInterval(checkAudioInterval);
          }
        }, 100); // check every 100 milliseconds
        audio.paused ? audio.play() : audio.pause();
        console.log("Playing audio for " + sceneName);
        console.log("Audio paused? " + audio.paused);
        break;
      case 'Family Parlor':
        audio = document.getElementById("Parlor-audio");
        checkAudioInterval = setInterval(function() {
          if (audio.currentTime >= pauseTime) {
            audio.pause();
            clearInterval(checkAudioInterval);
          }
        }, 100); // check every 100 milliseconds
        audio.paused ? audio.play() : audio.pause();
        console.log("Playing audio for " + sceneName);
        console.log("Audio paused? " + audio.paused);
        break;
      case 'Study':
        audio = document.getElementById("Study-audio");
        checkAudioInterval = setInterval(function() {
          if (audio.currentTime >= pauseTime) {
            audio.pause();
            clearInterval(checkAudioInterval);
          }
        }, 100); // check every 100 milliseconds
        audio.paused ? audio.play() : audio.pause();
        console.log("Playing audio for " + sceneName);
        console.log("Audio paused? " + audio.paused);
        break;
      case 'Hewlett Guest Room':
        audio = document.getElementById("Hewlett-audio");
        checkAudioInterval = setInterval(function() {
          if (audio.currentTime >= pauseTime) {
            audio.pause();
            clearInterval(checkAudioInterval);
          }
        }, 100); // check every 100 milliseconds
        audio.paused ? audio.play() : audio.pause();
        console.log("Playing audio for " + sceneName);
        console.log("Audio paused? " + audio.paused);
        break;
      default:
        console.log("\n\n No recording for this room....\n\n")
    }
  });


  var audioTextBtn = document.getElementById("audiotxt-btn");
  audioTextBtn.addEventListener("click", displayAudioTranscript);

  function displayAudioTranscript() {
    //audio transcript display button functionality
    
    const audioTranscriptDetails = {
      "Girl\'s Bedchamber" : "My name is Alice. My mother, Rachel Martin met\nThomas Banister, a loyalist from Rhode Island while\nhe was serving in a militia near our home during the\nRevolutionary War. My grandparents approved and\nthey were soon married. My father and Uncle Samuel\nwould become close, life-long friends.\nGrowing up at Rock Hall, my brothers attended\nprivate schools where they studied a wide variety of\nsubjects that included Latin, literature, poetry and\nscience. I, like most young ladies of the time, was\neducated at home. Fortunately, I was able to attend a\nfinishing school where I learned female\naccomplishments. These included music, dance, art,\nand stitchery.\nI completed this silk-embroidered sampler you see on\nyour left in 1797 when I was only ten years old.\nStitchery would prepare me for running Proper\nHousehold - making clothing, linens and\nbedhangings.\nAt 19, I married William McNeill and together we\nhave seven children. My family will be the last of the\nMartins to reside at this beautiful estate.",

      "Dr. Samuel Martin\'s Bedchamber" : "I am Samuel Martin. The year is 1805. When my father Josiah died in 1778, I, his eldest\nson, inherited the plantation in Antigua [an-tee-guh] and the Rock Hall property.\nAs head of the household, I used this bedchamber for my rest. My new bedcurtains\nhave just arrived! The fabric is green wool moreen. I can draw these curtains up with a\nstring or let them down for privacy and warmth. The sea chest in this room is a family\nheirloom and dates to approximately 1700.\nThe war is long over now and life is good here. We have all that we need. The barn\nhouses 2 English bulls and 4 English cows. There are 32 sheep and 18 lambs. Grazing\nin the fields are cows and heifers. We own hogs, pigs, fowl, turkey, ducks and geese. To\nthe east the carriage house has wagons, carriages and a sulky, as well as sleds and sleighs.\nIn my will of 1802, I provided that Rock Hall would pass to my sisters Alice and Rachel.\nThe plantation in Antigua [an-tee-guh] is bequeathed to my brother William in England,\nwith all money and my library. I will free the children of “my late mulatto woman Molly”\nand I will provide by practical and caring means for their adult lives.",

      "Family Parlor" : "This family parlor reflects a multi-purpose room where the head of the household,\nJosiah Martin, and later Doctor Samuel Martin, could tend to both the Rock Hall estate\nand the Antiguan plantation in the West Indies. Cargo ships loaded with\nbarrels of sugar were undoubtedly tracked as they traveled from the West Indies to New\nYork Harbor, where the sugar found its market. Those same ships were then loaded with provisions and sent back to the Martin\'s West Indian plantation. The record\nkeeping and management of the Martin estates may have taken place at a secretary desk\nlike this one. In the evening, this same room may have been used for informal\ngatherings and recreational games.\nLocated in this room are the original keys from Rock Hall and prints of King George\nIII and Queen Charlotte.\nThe mantel and moldings in this room and other rooms on the east side of the house\ncontain the original 1767 Georgian style.",

      "Study" : "My name is Samuel Martin. This room contains my medical equipment and library.\nUnlike most physicians in the Colonies who were trained by apprenticeship, I earned\nmy medical degree from the preeminent Royal College of Physicians in Edinburgh\n, Scotland. After my graduation in 1765, I returned to Long Island\nand Rock Hall as a physician and gentleman of privilege.\n\nI doctored the countryside, administered medicines, practiced bloodletting, dressed\nwounds, reduced fractures, and performed minor surgery. Some of the drugs that I\nused were made from native and home-grown botanicals. On the table in this room is\nan assortment of medical equipment. The medicine chest room in this contains\nmedicines for common disorders and a set of scales, weights and measuring cups.\nThere is also a brass microscope on the table for the study of tissue and blood; a\ntooth-key for removal of teeth; and a pocket surgical set containing scissors, silver\ncatheter and four scalpels.\n\nEpidemics plagued the colonies and were a constant threat. Among the most dramatic\nand deadly of these diseases was smallpox, diphtheria, measles, scarlet fever,\nwhooping cough, and yellow fever. Quarantine, inoculation and public sanitary\nmeasures were used to control these epidemics.",

      "Hewlett Guest Room" : "My name is Thomas Hewlett. As a farmer, just married,\nand learning about the value of marshland, I began to\nacquire land along the seashore. So, when I heard the\nprestigious Rock Hall estate was up for sale, I jumped at\nthe chance to purchase. The circumstances at Rock Hall\nhad become dire after Martin descendant Alice Banister\nMcneill had become terminally ill with breast cancer. Her\nhusband William McNeill had been in Alabama\nestablishing a new life for his Rock Hall family. Upon her\npassing, I purchased Rock Hall and 125 acres for just over\n$5,000. The Hewlett family soon filled the house. Mary and\nI will go on to have 9 children. My parents, Mary's sister\nand family moved in as well.\nWith a substantial mortgage I had to supplement my farm\nincome. With my growing family to support, and the\nincreasing popularity of Far Rockaway beach for seaside\nvacationing, I opened Rock Hall in the summer months to\npaying guests. This breezy, seaside area became a vacation\nspot for fashionable New Yorkers. Only a year after our\narrival, we celebrated our country's national holiday with\nfriends in our new home. On your right, an inscribed glass\nwindow pane from our guest parlor where our friends\netched their names on Independence Day, July 4, 1825.\nThis room is furnished in the style of an 1840 guest room,\ncomplete with provisions for hygiene. These include a\nmodern' bathtub and fancy commode chair."
    };


    //Reset all image hotspot elements and close hotspot window if it is currently open
    var imageWrapper = document.getElementById('image-wrapper');
    imageWrapper.classList.toggle("visible", false);
    /*
      As the hotspot window's values are being completely reset, the current information being displayed will be erased
      To load it again if the user were to click on it after closing the audio transcript window, treat it like if the user
      was clicking on any hotspot for the first time
    */
    previousHotspot = null;
    resetHotSpotValues(imageWrapper);

    var sceneName = document.querySelector('#titleBar .sceneName').innerHTML;
    var textBox = document.getElementById("audio-transcript");
    var audiotxt = document.getElementById("audio-txt-paragraph");
    
    if(!audiotxt.innerHTML) {
      audiotxt.innerHTML = audioTranscriptDetails[sceneName];
      textBox.style.display = "";
    } else {
      audiotxt.innerHTML = "";
      textBox.style.display = "none";
    }
      
  }
  // Display the initial scene.
  switchScene(scenes[1]);

})();
