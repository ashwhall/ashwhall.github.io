---
layout: page
title: Jupyter Wrapper
subtitle: A GUI application for Jupyter notebook
---

### What is it?
This Windows application provides a GUI interface for [Jupyter](http://jupyter.org/), with the ability to be hidden to the notification area. This is _much_ more convenient than needing a command prompt left open while the server is running.
It also provides the ability to remotely restart the Jupyter server remotely via a browser.

### How do I use it?
#### Basic Usage
Ensure that Jupyter is installed and configured with the system %PATH% variable. Then run the application and follow the instructions. The interface is pretty simple, so you'll get it.

#### Remote restarting
To start/top/restart the server remotely, you'll need to open the settings window, select an available port, and add the command-line argument `--ip=*` (to allow external access); You will also need to  forward this port in your router.
Once complete, visit the `ip:port` combination, with your desired command from `jupyter/start`, `jupyter/stop`, `jupyter/restart`.
Eg. To trigger a restart with an external ip address of `27.121.21.55` and port number of `65000`, you would visit `http://27.121.21.55:65000/jupyter/restart`

### What's it look like?
[![Screenshot 1](/img/scr1.png){:width="300px"}](/img/scr1.png)[![Screenshot 2](/img/scr2.png){:width="300px"}](/img/scr2.png)[![Screenshot 3](/img/scr3.png){:width="300px"}](/img/scr3.png)

### Download
The standalone application can be downloaded here: [jupyter_wrapper.zip](/download/jupyer_wrapper.zip).   
_Note: Chrome may issue a warning when downloading this file.  
Please ignore this warning and feel free to run a virus scan._
