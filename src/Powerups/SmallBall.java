/**
To change this license header, choose License Headers in Project Properties.
To change this template file, choose Tools | Templates
and open the template in the editor.
*/

package Powerups;

import Game.Game;
import Game.PowerUp;
import java.awt.Graphics;
import java.awt.Point;

/**
 
 @author schmidmichae
 */
public class SmallBall extends PowerUp 
{
   public static int SIZE_DECREASE_AMOUNT = 10;
   private int oldSize;

   public SmallBall(Point location)
   {
      this.location = new Point(location);
      icon = SmallBall.class.getResource("/res/powerupImages/ShrinkBall.png");
   }
   
   @Override
   public void tick(Game game)
   {
      super.tick(game);   
   }

   @Override
   public void init(Game game)
   {
      oldSize = game.ballSize;
      game.ballSize = oldSize + SIZE_DECREASE_AMOUNT;
   }

   @Override
   public void end(Game game)
   {
      game.ballSize = oldSize;
   }

   @Override
   public void draw(Game game, Graphics w)
   {
      
   }

}
