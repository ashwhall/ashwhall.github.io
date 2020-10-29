Original dataset: https://nlp.stanford.edu/sentiment/

Modified in the following ways:
 - Examples with text length < 20 characters discarded
 - Negative labels are those with scores in [0, 0.4]
 - Positive labels are those with scores in (0.6, 1]
 - All other examples discarded
 - All data shuffled and split into 90/10 train/test splits ("train.csv"/"test.csv")
 - First ~10% of examples in "train.csv" and "test.csv" extracted and saved as "train-small.csv" and "test-small.csv"
