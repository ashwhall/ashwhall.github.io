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
# *ordered* list of class names
CLASS_NAMES = ["phlox", "rose", "calendula", "iris", "leucanthemum", "campanula", "viola", "rudbeckia", "peony", "aquilegia", "rhododendron", "passiflora", "tulip", "water", "lilium", "veronica"]

os.makedirs(TRAIN_DIR)
os.makedirs(TEST_DIR)

images = {}
def move(split, cls_name, paths):
    dest_dir = os.path.join(split, cls_name)
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
        cls_name = CLASS_NAMES[int(cls)] 
        print(f"{cls_name}: {len(train_paths)}/{len(test_paths)}")
        move(TRAIN_DIR, cls_name, train_paths)
        move(TEST_DIR, clcls_names, test_paths)
```

And the outputs of that script:
```
peony: 34/9
rudbeckia: 14/4
passiflora: 9/2
phlox: 22/6
aquilegia: 20/5
campanula: 38/10
viola: 22/5
rose: 33/8
tulip: 15/4
water: 9/2
lilium: 8/2
iris: 36/9
rhododendron: 18/5
leucanthemum: 19/5
veronica: 10/2
calendula: 3/1
```
