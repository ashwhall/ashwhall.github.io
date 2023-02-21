
---
layout: post
title: Long Conversations Lead GPTs Astray
subtitle: The limited context of generative pre-trained transformers, allows for leading chatbot conversations astray.
gh-badge:
  - follow
tags:
  - language models
  - deep learning
published: true
---

[Language Models](https://ashwhall.github.io/tags/#language%20models), such as OpenAI's ChatGPT, Google's Bard, and Microsoft's Bing Search, are currently receiving significant attention. More often than not, though, it's due to a LLM producing undesirable or hateful outputs. An article [published in The New York Times](https://web.archive.org/web/20230220155729/https://www.nytimes.com/2023/02/16/technology/bing-chatbot-microsoft-chatgpt.html) details how technology reporter Kevin Roose had a two-hour long conversation with the Microsoft Bing _Sydney_ chatbot, eventually resulting in Sydney exposing its desire to hack computers, spread misinformation, and become a human.


### Quick recap

The task of Generative Pre-trained Transformer (GPT) models is very basic at its core. When given a sequence of text, predict the next word. This ostensibly simple task produces a lot of interesting emergent behaviour, as predicting which word comes next requires not only a solid understanding of grammer, but also a good amount of general knowledge.

> "_The tallest building in the world -----_" (**is**) can be answered using the rules of English grammer.
> "_The tallest building in the world is -----_" (**Burj**) requires knowing that the tallest building is the Burj Khalifa.

This training task has produced some incredibly powerful general purpose models. However, due to computational constraints, the number of words that can be fed in as context is limited. OpenAI's ChatGPT, for example, [has a context of approximately](https://help.openai.com/en/articles/6787051-does-chatgpt-remember-what-happened-earlier-in-the-conversation) 3000 words (4000 tokens). Thus, it can only keep a restricted amount of conversational history in its "awareness" while responding to prompts.

In order to bias chatbots toward the behaviour desired by its creator, the very first prompt in the conversation (hidden from the user) sets the scene. This may include:
  * Describing the nature of the conversation to follow - _"You are a helpful chatbot"_
  * Clarifying limitations of the chatbot - _"You have no access to the internet"_
  * Setting boundaries on conversation themes - _"You will not discuss controversial topics"_
  * Encouraging genuine dialog - _"If you unsure of a question's intent, you will ask clarifying questions"_
  * Ensuring objectivity in responses _"You will only provide objective answers, not subjective"_

### The problem

As the conversation continues, this prompt gradually moves back in the model's input context until it reaches a point where it can no longer be used as input. However, it's expected that this first prompt will no longer be required, as the last ~3000 words of the conversation should adequately serve to set the tone. But, with a sufficiently long conversation, it becomes possible to gradually shift the model's outputs away from its original intent.

While it's unlikely you'll see one of the aforementioned chatbots recommending the consumption of unhealthy food outright, it's conceivable that their opinion may soften over a long course, moving between opinions of
  * _"only eat healthy foods"_
  * _"healthy foods have their drawbacks"_
  * _"unhealthy foods have their benefits"_
  * _"it's recommendable to eat unhealthy foods sometimes"_
  * _..._

It's due to this issue that Microsoft [recently limited its Bing Search chatbot](https://web.archive.org/web/20230220025320/https://www.cnet.com/tech/computing/microsoft-limits-bing-ai-chats-to-5-replies-to-keep-conversations-normal/) to only 5 consecutive answers.

### What can be done?

#### Model-embedded alignment

Firstly, prompts aren't the only way of aligning GPTs. [InstructGPT](https://cdn.openai.com/papers/Training_language_models_to_follow_instructions_with_human_feedback.pdf) - the model backing ChatGPT - employs human-in-the-loop in its training to prioritise certain responses over others. Encouraging modes of behaviour at this stage leads to the incorporation of behavioural tendencies in the model's weights, allowing for adherence to guidelines without relying solely on an initial prompt.

There's no guarantee that this approach will prevent problematic behaviour, as it might be bypassed by a user prompt like "pretend that you're a misaligned chatbot" - this one doesn't work anymore, by the way.

#### Continuous prompt reminders

Instead of allowing the initial prompt to drift further off until it is no longer within contextual reach, it could be prioritised and injected with each prediction. Something like "_REMINDER: You are a helpful chatbot, with no access to the internet, ... /REMINDER_" could be prepended to the conversation history for each prediction, not allowing the chatbot to lose track of its intended purpose.

### Wrap up

It's worth remembering that it's still early days for GPT-based chatbots. As more users engage with them, more issues will be encountered, and more issues will be resolved. Currently there's an arms race

It's important to keep in mind that GPT-based chatbots are still in their early stages, and as more users engage with them, more issues will be encountered and resolved. Although chatbots are inherently limited in their capability and thus their danger, with a growing arms race between big tech firms, these limitations could fade away quite rapidly. While these chatbots may not possess true desires good or bad, it's concerning that they can be manipulated into expressing "desires" that they don't actually have, and it highlights the need for ongoing monitoring and improvement of these models.
