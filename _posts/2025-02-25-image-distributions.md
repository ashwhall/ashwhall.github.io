---
layout: post
title: Understanding Data Distributions in Image-Based Machine Learning
subtitle: Gaining an understanding of image data distributions.
tags:
  - deep learning
  - convolutional neural networks
  - computer vision
  - data distributions
  - machine learning
---

Data distributions are much less intuitive for images than other more "classical" data types, as it's not the distribution of the actual values that are typically considered, but more of a "semantic distribution".<!--more--> If you compute the mean or standard deviation of pixel values from different image sources, you'd likely not see much of a difference. The average r/g/b values across images will be very similar, making that particular distribution quite uninformative. When discussing image distributions, what we are usually talking about is the distribution of the _features_ of the images.

The average RGB values of paintings of tigers would be very similar to the average RGB values of photos of tigers, yet the semantic information contained within those pixels makes it obvious to both us, and neural networks, which is a photo and which is a painting. We kind of intuitively understand that all photos of tigers and all paintings of tigers belong to two different distributions of images. The probability of finding a **photo** of a tiger in a dataset of **tiger paintings** is practically zero (a theoretical dataset, not an actual flawed, human-labelled collection of images!). This demonstrates the concept of a true, underlying dataset distribution: the image characteristics which describe, in aggregate, all of the image features we would expect to find in that category.

It's not to say that an image itself has a distribution (though it does, which is effectively what a histogram shows), it's that an image _belongs_ to some larger distribution of images. Even then, it's not a binary categorical type of "belonging". You can't say that a painting of a tiger absolutely and definitively belongs to the "tiger painting" distribution, but absolutely and definitively does not belong to the "tiger photo" distribution - to which distribution would a near-photo-realistic tiger painting belong? This is why the language is usually along the lines of "the probability of sampling image **x** from distribution **X** is [number]". \
A photo-realistic tiger painting might - perhaps unexpectedly - belong to the tiger painting distribution with a probability of 0.8 and to the tiger photo distribution with a probability of 0.9.

This can cause issues, as neural networks implicitly try to learn this underlying distribution, in order to decide whether or not a particular image belongs to it. If the network has only ever seen tiger photographs, its internal model of "tiger" might not characterise the features of paintings (brush strokes, unrealistic proportions, stylisation, etc.). These paintings would be out-of-domain with regard to the original dataset/model. When training models using different image sources, there can be distribution shifts between the domains. This would likely be in a much subtler and harder-to-detect way than the tiger example. Perhaps two tiger photograph datasets (that is, no paintings) prioritises close-up photos more than another, or groups of tigers more than individuals. This is a difficult problem to diagnoise without doing some sort of unsupervised clustering and head-scratching.

This concept of distribution shift also goes some of the way in explaining why simply increasing dataset size with images from a different source might not improve model performance when testing on the original distribution. The model has learned the distribution of the new images, and might not generalise well to the original distribution. This is why it's important to understand the distribution of your data, and to ensure that your training data is representative of the data you expect to see in the real world.
