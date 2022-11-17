---
layout: post
title: Deep Learning Interview
subtitle: >-
  Transcription of an interview filmed for La Trobe University's Deep Learning
  subject
gh-badge:
  - follow
tags:
  - interview
  - deep learning
published: true
---

This interview was conducted by Zhen He of La Trobe University, Melbourne, for his subject CSE5DL - Deep Learning. My answers were prepared before the interview and filmed for presentation throughout the course. At the time of this interview I'm employed by the Australian Institute of Sport as the machine learning research engineer lead, so my answers are given mostly within that context.

## _Tell us about some of the cool projects you have worked on._

I've worked on a number of interesting projects during my time at the AIS, but these are the particular standouts.

**SPARTA2** - a computer-vision project which uses deep convolutional neural networks to detect and track swimmers through a swimming race. This is the primary competition analysis tool used by swimming australia at all national and international events, including the Tokyo Olympics and Paralympics in 2021. It runs entirely on gaming laptops beside the pool, it can be operated by a single person, and allows sports scientists to gain insight into not only their own swimmers, but also their competitors, with a really quick turnaround.

**ThrowCoach** - an iPad app which uses deep neural networks and augmented reality to detect the pose of a javelin thrower during training. It's quick to set up on a tripod, it supports video capture using any nearby mobile phone, and provides metrics like throw velocity, throw distance, and various joint angles. This allows the coach and athlete to quickly capture and analyse throwing technique in the training environment, creating a tight loop between performance and coach intervention.

**Pipelines** - a deep learning web application which allows users to stitch together their own deep learning pipelines without having any programming knowledge. We at the AIS have developed a number of sports-oriented deep learning models trained on our own in-house datasets, with the purpose of enabling the Australian sports science network to take advantage of the latest advances in machine learning. Once the user has designed their pipeline with our graphical user interface, they can upload their video data, run the pipeline on the cloud, and simply download the results when they're ready.

## _What aspect of your job do you like the most?_

I got into computer science not just because I have a passion for computers, numbers, algorithmic thinking, but also because I just love tinkering. In my role as research engineer lead for the AIS, I'm fortunate to sit in the intersection of those two things. I spend some of my time reading research papers and exploring new developments in AI, and some of my time getting into the nitty gritty of software engineering. It's a fantastic balance which allows me to dig around and satisfy my curiosities, while also achieving an outcome.

## _What’s some cool tech that you’ve had a chance to play around with because of deep learning? _

As the nature of my projects vary quite a bit, I've had my hands on a variety of interesting gadgets. Among those, one of my favourites is the Nvidia Jetson Xavier, which is a small form-factor computer which is basically an Nvidia graphics card, with just enough CPU and memory to not be a bottleneck for the GPU. It's small enough to hold in one hand, it runs Linux, and it's actually a pretty nice environment for running inference of deep learning models.
It's even been enjoyable simply to get out and see how deep learning techniques apply in the real world. A common task in computer vision is to calibrate cameras using a calibration board - which is essentially just some black dots printed on a stiff board which you then have to walk in front of the camera. As trivial as it may seem, it's quite interesting to take something as menial-sounding as waving a board around into the real world and see how your assumptions play out in reality. On the non-hardware side of things, on numerous occasions I've come across a research paper, found that they have their code and models available on GitHub, then pulled it and seen how it functions in a sports setting. I've done this with transformer architectures for pose and object detection, and some of the newest and most powerful multiple-object tracking algorithms.

## _What deep learning framework do you use for training neural networks?_

My weapon of choice for deep learning is PyTorch, which is an open-source machine learning framework with a Python interface. I've used Tensorflow intermittently over the years, but PyTorch has always been my favourite.

## _What do you like about Pytorch?_

The main thing I like about PyTorch is how intuitive it is. It's a very sensibly designed framework, where it's opinionated enough for users to mostly converge towards a consistent implementation, while being unopinionated enough to remain versatile. In fact, it doesn't need to be used for machine learning at all, and is actually quite fit-for-purpose for a large variety of GPU computation tasks. As an example, there is a mathematical model called "NURBS" - which stands for non-uniform rational basis spline - which is used to represent and compute curves and surfaces, often for engineering and manufacturing. It's a fairly complicated algorithm and can be slow to compute in large numbers. I implemented a version of this in PyTorch and compared it to another Python library, to find that my implementation was on the order of 100 times faster than the pre-existing library. That's a great testament to the flexibility of PyTorch, more than it is to my programming abilities.

## _What are some of your favourite tips/tricks or auxiliary training ideas for successfully training Neural Networks?_

Due to the time and cost that can be involved with training a neural net, my biggest tip would be to not enter into training blindly. We're fortunate enough to not be the first people to train an object detector, or a pose estimator, or a classification model. When at all possible, take a look at similar papers or implementations. You shouldn't have to guess at what the learning rate is, or which optimiser works best, as someone else has probably done something very similar in the past. If your model takes 48 hours to train, you can easily spend a week training a few networks just trying to find a good learning rate. Instead, look for similar work and see which learning rate and optimiser they've used. You don't have to get this value perfect, but it's easy to be off by a factor of 10.

This leads me to my next point - perfect isn't mandatory. Unless it's for a competition or it's safety critical, it's usually best to accept the diminishing returns nature of neural net development. If you've determined that 95% accuracy is sufficient for your task and you've spent a lot of time to reach 95%, it's often better to spend your time working on another facet, than trying to tweak the hyperparameters enough to achieve 96%.

Finally, it's important to consider that bad inputs often lead to bad outputs. If you don't have a good understanding of your dataset, or don't have a lot of confidence in the cleanliness of your dataset, odds are that you'll make bigger improvements by spending more time with the data. Neural networks are just sophisticated ways of learning correlations between input and output data. If you can do anything to reduce any spurious or confounding information in the dataset without introducing bias, then this is a great use of your time. Take the time to visualise your data and gain an intuitive understanding of it - it'll always pay off and you'd be surprised how often you find something unexpected.

## _From your experience how well do convolutional neural networks work in practice?_

I never cease to be amazed at how well convolutional neural nets work. At the macro level they're very sophisticated computational structures, but when you get down to the micro, they're actually very simple. It's incredible how far you can get with a bunch of matrix multiplications and non-linearity functions. In my experience, it's more often the dataset, rather than the network itself, that is the limiting factor. If you have access to a good, clean dataset, with some sensible augmentation such as flipping, rotating, colour space manipulation, they are great at generalising to unseen data. Oftentimes you'll come across real-world examples which completely confuse a model, and this is because the real world differs from your training set in some unexpected way. This can be fixed by identifying that domain shift, augmenting your dataset with examples of that nature, and re-training. Once all of the pieces are in place, this process of gathering new examples and re-training can be fairly automated.

## _From your experience how effective is transfer learning for improving model performance compared to random weight initialisation?_

In my experience, transfer learning has of the time boosted model performance by a measurable amount in every case. Even when the task is different - for example, you're doing pose estimation and you use an object detector as your base model - the representational capability embedded in the network body is readily able to be transferred to the new task. I'd argue that any time a pre-trained model is available, this should absolutely be used over random weight initialisation. The only exception being when the original dataset varies significantly from the new task - for example, I wouldn't use a medical imaging model as a base for a basketball detection task.

## _What are some of the traps or pitfalls when deploying production DL systems?_

The biggest trap - which also happens to be the most avoidable - is not having the foresight to tailor your model architecture to the target environment. There are always a number of factors which influence the suitability of a model for a particular environment, so you should keep it front-of-mind while in the model design and training stage.

The main factors are:

- How much memory the model consumes during inference
  - I may train my model on a graphics card with 12GB of memory, but the target device may only have a few gigabytes to play with.
- How fast model inference is
  - Again, I may train my model on the latest and greatest hardware, but if I’m deploying to an older machine, I may encounter a significant performance drop.
- How easily the model can be applied to the target device architecture.
  - For example, neural networks for iOS need to be converted to a proprietary format using a conversion library provided by Apple. You may find that a recently-added PyTorch feature isn’t yet supported, and will have to invest time in finding a workaround.
- And lastly - is it possible to run this model on just the CPU instead of a GPU?
  - GPUs are incredibly useful for deep learning, but they introduce both complexity and cost, particularly in deployment. It’s worthwhile considering the relative advantage of using a GPU in production. Even if a GPU increases inference speed by a factor of 100, perhaps an increase in latency from 10ms to 1 second is tolerable, depending on the way users will interact with it.

How do you address these problems?

It’s actually quite easy, assuming you have access to the deployment environment. Go through a mock deployment before getting into the actual modelling stage. So, start with a very basic, untrained model, and see what steps it takes to get it onto your target device. You should also write a test script which passes some dummy inputs into your model to benchmark its speed and memory requirements. Once you have a basic pathway for performing all of these steps, you can verify the suitability of any prospective model architecture before even training it.

## _What are some challenges when building object detection systems for the real world?_

The first and often most expensive challenge is the dataset. You need to gather a dataset that accurately represents the real-world environment, and then label the data consistently. Consistency in labelling can be surprisingly difficult to do, especially when you have multiple people working on it in tandem. It's worth the effort in rigorously defining the labelling task to minimise any variation between annotators. Your dataset has to be clean, diverse, and sufficiently large to not overfit the model to the provided data.

It's amazing how often you don't realise there was a gap in your dataset until you take it out into the wild and encounter cases that you simply couldn't predict. Depending on your use case and your tolerance for error, this can result in an iterative process where you continually grow your labelled dataset with edge-case examples simply to chase that long tail in the distribution of examples.

An ongoing, open problem is long-term tracking and reidentification. In a lot of cases we don't only desire to detect the locations of objects in an image, but to also track them through time from a video. This has a large number of complexities, such as:

- How do we persist the identity of multiple objects as they move through a dynamic scene?
- What happens when an object is occluded by something in the foreground?
- How do we reidentify and reassociate an object that was hidden for a period of time, but has returned?
- How do we do this robustly in settings where objects all have similar appearance features, such as in team sports?

These problems are unsolved generally, but you'll find that you can get reasonably far by applying some domain-specific knowledge to the problem. The task is much easier if you know that the objects only move in straight lines, for example.
