Original dataset: https://www.kaggle.com/biancaferreira/african-wildlife

This is a scaled down version of the African Wildlife Kaggle dataset with fewer images.

This dataset contains 20 training images and 80 test images of each of the 4 animals:
 - buffalo
 - elephant
 - rhino
 - zebra

Each image has been rescaled such that its width is 256px, preserving its aspect ratio using the command:
`$ mogrify -resize 256 *.jpg`
