---
layout: page
title: Projects
---

<div class="posts">
  {% for project in site.projects %}
  <div class="project">
    <h1 class="post-title">
      <a href="{{ post.url }}"> {{ project.name }} </a>
    </h1>
    <div class="post-subtitle">{{ project.short-description }}</div>
  </div>
  {% endfor %}
</div>
