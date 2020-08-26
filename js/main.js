// Dean Attali / Beautiful Jekyll 2016

var main = {

  bigImgEl : null,
  numImgs : null,

  init : function() {
    // Shorten the navbar after scrolling a little bit down
    $(window).scroll(function() {
        if ($(".navbar").offset().top > 50) {
            $(".navbar").addClass("top-nav-short");
            $(".navbar-custom .avatar-container").fadeOut(500);
        } else {
            $(".navbar").removeClass("top-nav-short");
            $(".navbar-custom .avatar-container").fadeIn(500);
        }
    });

    // On mobile, hide the avatar when expanding the navbar menu
    $('#main-navbar').on('show.bs.collapse', function () {
      $(".navbar").addClass("top-nav-expanded");
    });
    $('#main-navbar').on('hidden.bs.collapse', function () {
      $(".navbar").removeClass("top-nav-expanded");
    });

    // On mobile, when clicking on a multi-level navbar menu, show the child links
    $('#main-navbar').on("click", ".navlinks-parent", function(e) {
      var target = e.target;
      $.each($(".navlinks-parent"), function(key, value) {
        if (value == target) {
          $(value).parent().toggleClass("show-children");
        } else {
          $(value).parent().removeClass("show-children");
        }
      });
    });

    // Ensure nested navbar menus are not longer than the menu header
    var menus = $(".navlinks-container");
    if (menus.length > 0) {
      var navbar = $("#main-navbar ul");
      var fakeMenuHtml = "<li class='fake-menu' style='display:none;'><a></a></li>";
      navbar.append(fakeMenuHtml);
      var fakeMenu = $(".fake-menu");

      $.each(menus, function(i) {
        var parent = $(menus[i]).find(".navlinks-parent");
        var children = $(menus[i]).find(".navlinks-children a");
        var words = [];
        $.each(children, function(idx, el) { words = words.concat($(el).text().trim().split(/\s+/)); });
        var maxwidth = 0;
        $.each(words, function(id, word) {
          fakeMenu.html("<a>" + word + "</a>");
          var width =  fakeMenu.width();
          if (width > maxwidth) {
            maxwidth = width;
          }
        });
        $(menus[i]).css('min-width', maxwidth + 'px')
      });

      fakeMenu.remove();
    }

    // show the big header image
    main.initImgs();
  },

  initImgs : function() {
    // If the page was large images to randomly select from, choose an image
    if ($("#header-big-imgs").length > 0) {
      main.bigImgEl = $("#header-big-imgs");
      main.numImgs = main.bigImgEl.attr("data-num-img");

          // 2fc73a3a967e97599c9763d05e564189
	  // set an initial image
	  var imgInfo = main.getImgInfo();
	  var src = imgInfo.src;
	  var desc = imgInfo.desc;
  	  main.setImg(src, desc);

	  // For better UX, prefetch the next image so that it will already be loaded when we want to show it
  	  var getNextImg = function() {
	    var imgInfo = main.getImgInfo();
	    var src = imgInfo.src;
	    var desc = imgInfo.desc;

		var prefetchImg = new Image();
  		prefetchImg.src = src;
		// if I want to do something once the image is ready: `prefetchImg.onload = function(){}`

  		setTimeout(function(){
                  var img = $("<div></div>").addClass("big-img-transition").css("background-image", 'url(' + src + ')');
  		  $(".intro-header.big-img").prepend(img);
  		  setTimeout(function(){ img.css("opacity", "1"); }, 50);

		  // after the animation of fading in the new image is done, prefetch the next one
  		  //img.one("transitioned webkitTransitionEnd oTransitionEnd MSTransitionEnd", function(){
		  setTimeout(function() {
		    main.setImg(src, desc);
			img.remove();
  			getNextImg();
		  }, 1000);
  		  //});
  		}, 6000);
  	  };

	  // If there are multiple images, cycle through them
	  if (main.numImgs > 1) {
  	    getNextImg();
	  }
    }
  },

  getImgInfo : function() {
  	var randNum = Math.floor((Math.random() * main.numImgs) + 1);
    var src = main.bigImgEl.attr("data-img-src-" + randNum);
	var desc = main.bigImgEl.attr("data-img-desc-" + randNum);

	return {
	  src : src,
	  desc : desc
	}
  },

  setImg : function(src, desc) {
	$(".intro-header.big-img").css("background-image", 'url(' + src + ')');
	if (typeof desc !== typeof undefined && desc !== false) {
	  $(".img-desc").text(desc).show();
	} else {
	  $(".img-desc").hide();
	}
  }
};

// 2fc73a3a967e97599c9763d05e564189

document.addEventListener('DOMContentLoaded', main.init);
document.addEventListener('DOMContentLoaded', function() {
	const body = document.querySelector('body');
	body.style.minHeight = '100%';
	const canvas = document.createElement('canvas');
	body.insertBefore(canvas, body.firstChild);
	canvas.id = 'dot-canvas';
	canvas.style.position = 'fixed';
	canvas.style.top = 0;
	canvas.style.left = 0;
	canvas.style.bottom = 0;
	canvas.style.right = 0;
	const { width, height } = body.getBoundingClientRect();
	canvas.style.width = width;
	canvas.style.height = height;
	const ctx = canvas.getContext('2d');
	canvas.width = width;
	canvas.height = height;
	window.addEventListener('mousemove', updateMousePos, false);
	let mousePos = [-1000, -1000];
	const NUM_DOTS = 75;
	const MIN_SPEED = 0.3;
	const MAX_SPEED = 1;
	const DOT_SIZE = 2;
	const MAX_DIST = 100 ** 2;
	const INFLUENCE_DISTANCE = 100;
	const MOUSE_INFLUENCE_AMOUNT = 1 / 50;

	const dots = [];
	for (let i = 0; i < NUM_DOTS; i++) {
	  const angle = Math.random() * Math.PI * 2;
	  const speed = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED);
	  dots.push({
	    position: [Math.random() * canvas.width, Math.random() * canvas.height],
	    velocity: [
	      Math.cos(angle) * speed,
	      Math.sin(angle) * speed,
	    ],
	  });
	}

	function updateMousePos(e) {
	  mousePos = [e.clientX, e.clientY];
	}
	function influence(effectee, effector, amount) {
	  if (effectee === effector) return;
	  const mouseDist = Math.sqrt((effectee.position[0] - effector.position[0]) ** 2 + (effectee.position[1] - effector.position[1]) ** 2);
	  const mouseInfluence = Math.min(10, Math.max(1, INFLUENCE_DISTANCE / mouseDist));
	  if (mouseInfluence > 1) {
	    effectee.velocity[0] += (effector.position[0] - effectee.position[0]) / mouseDist * mouseInfluence * amount;
	    effectee.velocity[1] += (effector.position[1] - effectee.position[1]) / mouseDist * mouseInfluence * amount;
	  }
	}
	function updateDot(dot) {
	  influence(dot, { position: mousePos }, MOUSE_INFLUENCE_AMOUNT)
	  dot.position = [
	    (dot.position[0] + dot.velocity[0]) % canvas.width,
	    (dot.position[1] + dot.velocity[1]) % canvas.height,
	  ];
	  if (dot.position[0] < 0) dot.position[0] = canvas.width;
	  if (dot.position[1] < 1) dot.position[1] = canvas.height;
	}
	function lineBetween(l, r) {
	  if (l === r) return;
	  const dist = (l.position[0] - r.position[0]) ** 2 + (l.position[1] - r.position[1]) ** 2;
	  if (dist < MAX_DIST) {
	    ctx.beginPath();
	    ctx.fillStyle = '';
	    ctx.strokeStyle = `rgba(0, 0, 0, ${0.2 * (1 - dist / MAX_DIST)})`;
	    ctx.lineWidth = 1;
	    ctx.moveTo(l.position[0], l.position[1]);
	    ctx.lineTo(r.position[0], r.position[1]);
	    ctx.stroke();
	  }
	}
	function drawDot(dot) {
	  ctx.beginPath();
	  ctx.arc(dot.position[0], dot.position[1], DOT_SIZE, 0, 2 * Math.PI, false);
	  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
	  ctx.fill();
	  ctx.lineWidth = 5;
	  dots.forEach(other => lineBetween(dot, other));
	  lineBetween(dot, { position: mousePos });
	}
	function draw() {
	  canvas.width  = window.innerWidth;
	  canvas.height = window.innerHeight;
	  ctx.fillStyle = '#FFF';
	  ctx.fillRect(0, 0, canvas.width, canvas.height);

	  dots.forEach(updateDot)
	  dots.forEach(drawDot);
	  window.requestAnimationFrame(draw);
	}
	draw();
});
