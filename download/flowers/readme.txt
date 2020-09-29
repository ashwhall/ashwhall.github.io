Original dataset: https://www.kaggle.com/olgabelitskaya/flower-color-images

This is ostensibly a mirror of that dataset. The only changes are that this version has been partitioned 80/20 train/test, and moved into class folders.

The script used to produce this split:
```
import os
import shutil
import glob

TRAIN_SPLIT = .8
TRAIN_DIR = "train"
TEST_DIR = "test"

os.makedirs(TRAIN_DIR)
os.makedirs(TEST_DIR)

images = {}
def move(split, cls, paths):
        dest_dir = os.path.join(split, cls)
        os.makedirs(dest_dir)
        for path in paths:
                shutil.move(path, os.path.join(dest_dir, path))

images = {}
for path in glob.glob("*.png"):
        cls = path.split('_')[0]
        if cls not in images:
                images[cls] = []
        images[cls].append(path)


for cls, paths in images.items():
        num_imgs = len(paths)
        split_idx = int(round(TRAIN_SPLIT * num_imgs))
        train_paths = paths[:split_idx]
        test_paths = paths[split_idx:]
        print("Class:", cls)
        print("  train count:", len(train_paths))
        print("  test count :", len(test_paths))
        move(TRAIN_DIR, cls, train_paths)
        move(TEST_DIR, cls, test_paths)
```

And the outputs of that script:
```
Class: 02
  train count: 18
  test count : 4
Class: 08
  train count: 34
  test count : 9
Class: 07
  train count: 14
  test count : 4
Class: 11
  train count: 9
  test count : 2
Class: 00
  train count: 22
  test count : 6
Class: 09
  train count: 20
  test count : 5
Class: 05
  train count: 38
  test count : 10
Class: 06
  train count: 22
  test count : 5
Class: 01
  train count: 33
  test count : 8
Class: 12
  train count: 15
  test count : 4
Class: 13
  train count: 9
  test count : 2
Class: 14
  train count: 8
  test count : 2
Class: 03
  train count: 36
  test count : 9
Class: 10
  train count: 18
  test count : 5
Class: 04
  train count: 19
  test count : 5
Class: 15
  train count: 10
  test count : 2
```
